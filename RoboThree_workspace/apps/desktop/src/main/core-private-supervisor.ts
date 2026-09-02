import {
  fork,
  type ChildProcess,
  type Serializable,
} from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import {
  FOUNDATION_FIXTURE_SCHEMA,
  type FoundationRuntimeState,
  type FoundationStatus,
} from "../shared/foundation-api.js";
import { CorePrivateClient } from "./core-private-client.js";
import { PersonalCredentialBrokerClient } from "./personal-credential-broker-client.js";
import type { SensitiveTransportActivationDescriptor } from
  "../shared/sensitive-transport-activation.js";

const START_TIMEOUT_MS = 8_000;
const STOP_TIMEOUT_MS = 3_000;
const STOP_KILL_GRACE_MS = 1_000;
const RESTART_DELAY_MS = 150;
const STDERR_LIMIT_BYTES = 4_096;
const INTERNAL_TRIAL_DEPLOYMENT_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT" as const;
const INTERNAL_TRIAL_TOKEN_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN" as const;
const INTERNAL_TRIAL_AGENT_LIFECYCLE_TOKEN_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN" as const;
const INTERNAL_TRIAL_SKILL_LIFECYCLE_TOKEN_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_SKILL_LIFECYCLE_ACCESS_TOKEN" as const;
const PRIVATE_INSTALLED_SKILL_ROOT_ENV =
  "ROBOTHREE_PRIVATE_INSTALLED_SKILL_ROOT" as const;

type CoreReadyMessage = Readonly<{
  type: "desktop.core.ready";
  host: "127.0.0.1";
  port: number;
  runtimeInstanceId: string;
  coreVersion: string;
}>;

type SpawnCoreChild = (
  entryPath: string,
  internalTrial?: InternalTrialCoreEnvironmentLease,
) => ChildProcess;
type CreateCoreClient = (input: {
  baseUrl: string;
  authorizationToken: string;
}) => CorePrivateClient;
type Wait = (milliseconds: number) => Promise<void>;
type Fetch = typeof globalThis.fetch;
export type InternalTrialCoreEnvironmentLease = Readonly<{
  deployment?: string;
  accessToken?: Buffer;
  agentLifecycleAccessToken?: Buffer;
  skillLifecycleAccessToken?: Buffer;
}>;
type Dfi543TestHarness = Readonly<{
  credentialHelperDescriptor: Readonly<{
    helperPath: string;
    packageRootPath: string;
    manifestSha256: `sha256:${string}`;
    protocolVersion: "personal-keychain-helper.v1";
    activation: "test_isolated";
    testKeychainPath: string;
  }>;
  providerCaPem: string;
  providerPort: number;
}>;

export type ProductionPersonalCredentialHelperDescriptor = Readonly<{
  helperPath: string;
  packageRootPath: string;
  manifestSha256: `sha256:${string}`;
  protocolVersion: "personal-keychain-helper.v1";
  activation: "production_verified";
  designatedRequirement: string;
  teamIdentifier: string;
}>;

export class CorePrivateSupervisor {
  readonly #entryPath: string;
  readonly #databasePath: string;
  readonly #demoMode: "dcf2c" | "legacy_test" | undefined;
  readonly #credentialHelperDescriptor:
    ProductionPersonalCredentialHelperDescriptor | undefined;
  readonly #dfi543TestHarness: Dfi543TestHarness | undefined;
  readonly #sensitiveTransportActivationDescriptor:
    SensitiveTransportActivationDescriptor | undefined;
  readonly #maxUnexpectedRestarts: number;
  readonly #startTimeoutMs: number;
  readonly #stopTimeoutMs: number;
  readonly #restartDelayMs: number;
  readonly #spawnChild: SpawnCoreChild;
  readonly #createClient: CreateCoreClient;
  readonly #wait: Wait;
  readonly #fetch: Fetch;
  readonly #createAuthorizationToken: () => string;
  readonly #internalTrialEnvironment: InternalTrialCoreEnvironmentLease | undefined;
  readonly #clientInstanceId = randomUUID();
  #child: ChildProcess | undefined;
  #client: CorePrivateClient | undefined;
  #credentialBroker: PersonalCredentialBrokerClient | undefined;
  #runtimeInstanceId: string | undefined;
  #state: FoundationRuntimeState = "stopped";
  #startPromise: Promise<void> | undefined;
  #stopPromise: Promise<void> | undefined;
  #restartPromise: Promise<void> | undefined;
  #recoveryPromise: Promise<void> | undefined;
  #stopping = false;
  #unexpectedRestartCount = 0;
  #lastError: string | undefined;

  constructor(input: {
    entryPath: string;
    databasePath: string;
    demoMode?: "dcf2c" | "legacy_test";
    credentialHelperDescriptor?: ProductionPersonalCredentialHelperDescriptor;
    dfi543TestHarness?: Dfi543TestHarness;
    sensitiveTransportActivationDescriptor?: SensitiveTransportActivationDescriptor;
    privateInstalledSkillRoot?: string;
    maxUnexpectedRestarts?: number;
    dependencies?: {
      startTimeoutMs?: number;
      stopTimeoutMs?: number;
      restartDelayMs?: number;
      spawnChild?: SpawnCoreChild;
      createClient?: CreateCoreClient;
      wait?: Wait;
      fetch?: Fetch;
      createAuthorizationToken?: () => string;
    };
  }) {
    this.#entryPath = input.entryPath;
    this.#databasePath = input.databasePath;
    this.#demoMode = input.demoMode;
    this.#credentialHelperDescriptor = input.credentialHelperDescriptor;
    this.#dfi543TestHarness = input.dfi543TestHarness;
    this.#sensitiveTransportActivationDescriptor =
      input.sensitiveTransportActivationDescriptor;
    this.#maxUnexpectedRestarts = input.maxUnexpectedRestarts ?? 1;
    this.#startTimeoutMs = input.dependencies?.startTimeoutMs ?? START_TIMEOUT_MS;
    this.#stopTimeoutMs = input.dependencies?.stopTimeoutMs ?? STOP_TIMEOUT_MS;
    this.#restartDelayMs = input.dependencies?.restartDelayMs ?? RESTART_DELAY_MS;
    this.#internalTrialEnvironment = captureInternalTrialCoreEnvironment(process.env);
    this.#spawnChild = input.dependencies?.spawnChild
      ?? ((entryPath, internalTrial) => spawnCoreChild(
        entryPath,
        input.dfi543TestHarness !== undefined,
        internalTrial,
        input.privateInstalledSkillRoot,
      ));
    this.#createClient = input.dependencies?.createClient
      ?? ((clientInput) => new CorePrivateClient(clientInput));
    this.#wait = input.dependencies?.wait ?? (async (milliseconds) => {
      await delay(milliseconds);
    });
    this.#fetch = input.dependencies?.fetch ?? globalThis.fetch;
    this.#createAuthorizationToken = input.dependencies?.createAuthorizationToken
      ?? (() => randomBytes(32).toString("base64url"));
  }

  get client(): CorePrivateClient {
    if (this.#client === undefined || this.#state !== "ready") {
      throw new Error("Local Core client is unavailable");
    }
    return this.#client;
  }

  get clientInstanceId(): string {
    return this.#clientInstanceId;
  }

  get personalCredentialBroker(): PersonalCredentialBrokerClient {
    if (this.#credentialBroker === undefined || this.#state !== "ready") {
      throw new Error("Personal Credential Broker is unavailable");
    }
    return this.#credentialBroker;
  }

  get runtimeInstanceId(): string {
    if (this.#runtimeInstanceId === undefined || this.#state !== "ready") {
      throw new Error("Local Core runtime identity is unavailable");
    }
    return this.#runtimeInstanceId;
  }

  connectionLease(): CorePrivateConnectionLease {
    const client = this.client;
    return Object.freeze({
      client,
      runtimeInstanceId: this.runtimeInstanceId,
      transportClientInstanceId: this.#clientInstanceId,
    });
  }

  isCurrentConnectionLease(lease: CorePrivateConnectionLease): boolean {
    return this.#state === "ready"
      && this.#client === lease.client
      && this.#runtimeInstanceId === lease.runtimeInstanceId
      && this.#clientInstanceId === lease.transportClientInstanceId;
  }

  async start(): Promise<void> {
    if (this.#stopPromise !== undefined) {
      await this.#stopPromise;
      return this.start();
    }
    if (this.#state === "ready") return;
    if (this.#state === "failed") {
      throw new Error("Local Core failed; restart the Desktop application");
    }
    if (this.#restartPromise !== undefined) return this.#restartPromise;
    if (this.#recoveryPromise !== undefined) return this.#recoveryPromise;
    if (this.#startPromise !== undefined) return this.#startPromise;
    this.#stopping = false;
    this.#unexpectedRestartCount = 0;
    const operation = (async () => {
      try {
        await this.#launch("starting");
      } catch (error) {
        await this.#recoverAfterFailure(error);
      }
    })();
    this.#startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.#startPromise === operation) this.#startPromise = undefined;
    }
  }

  async stop(): Promise<void> {
    if (this.#stopPromise !== undefined) return this.#stopPromise;
    const pending = [
      this.#startPromise,
      this.#restartPromise,
      this.#recoveryPromise,
    ].filter((item): item is Promise<void> => item !== undefined);
    const operation = (async () => {
      this.#stopping = true;
      if (this.#state !== "stopped") this.#state = "stopping";
      const child = this.#detachActiveChild();
      await this.#shutdownChild(child);
      await Promise.allSettled(pending);
      this.#internalTrialEnvironment?.accessToken?.fill(0);
      this.#internalTrialEnvironment?.agentLifecycleAccessToken?.fill(0);
      this.#internalTrialEnvironment?.skillLifecycleAccessToken?.fill(0);
      this.#state = "stopped";
    })();
    this.#stopPromise = operation;
    try {
      await operation;
    } finally {
      if (this.#stopPromise === operation) this.#stopPromise = undefined;
    }
  }

  async restart(): Promise<void> {
    if (this.#state === "failed") {
      throw new Error("Local Core failed; restart the Desktop application");
    }
    if (this.#restartPromise !== undefined) return this.#restartPromise;
    if (this.#state !== "ready") {
      throw new Error("Local Core must be ready before a controlled restart");
    }
    const operation = (async () => {
      this.#state = "restarting";
      const child = this.#detachActiveChild();
      await this.#shutdownChild(child);
      if (this.#stopping) throw new Error("Local Core stopped during restart");
      try {
        await this.#launch("restarting");
      } catch (error) {
        await this.#recoverAfterFailure(error);
      }
    })();
    this.#restartPromise = operation;
    try {
      await operation;
    } finally {
      if (this.#restartPromise === operation) this.#restartPromise = undefined;
    }
  }

  snapshot(): FoundationStatus {
    return Object.freeze({
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      fixtureOnly: false,
      runtimeState: this.#state,
      coreReady: this.#state === "ready",
      compatible: this.#state === "ready",
      unexpectedRestartCount: this.#unexpectedRestartCount,
    });
  }

  async probe(): Promise<FoundationStatus> {
    if (this.#client === undefined || this.#state !== "ready") {
      return this.snapshot();
    }
    const [compatibility, status] = await Promise.all([
      this.#client.compatibility({
        contractVersion: "v1alpha1",
        type: "compatibility_query",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: this.#clientInstanceId,
      }),
      this.#client.runtimeStatus({
        contractVersion: "v1alpha1",
        type: "runtime_status_query",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: this.#clientInstanceId,
      }),
    ]);
    return Object.freeze({
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      fixtureOnly: false,
      runtimeState: this.#state,
      coreReady: status.ok && status.value.status === "ready",
      compatible: compatibility.ok,
      unexpectedRestartCount: this.#unexpectedRestartCount,
    });
  }

  lastFailureSummaryForDiagnostics(): string | undefined {
    return this.#lastError;
  }

  async #launch(state: "starting" | "restarting"): Promise<void> {
    this.#state = state;
    const authorizationToken = this.#createAuthorizationToken();
    const internalTrialEnvironment = await resolveInternalTrialCoreEnvironment(
      this.#internalTrialEnvironment,
      this.#fetch,
    );
    const child = this.#spawnChild(this.#entryPath, internalTrialEnvironment);
    this.#child = child;
    const sensitiveChannelInstanceId = randomUUID();
    const sensitiveStreams = getSensitiveStreams(child);
    const credentialBroker = sensitiveStreams === undefined
      ? undefined
      : new PersonalCredentialBrokerClient({
        ...sensitiveStreams,
        channelInstanceId: sensitiveChannelInstanceId,
        clientInstanceId: this.#clientInstanceId,
      });
    this.#credentialBroker = credentialBroker;
    let ready = false;
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= STDERR_LIMIT_BYTES) return;
      const bounded = chunk.subarray(0, STDERR_LIMIT_BYTES - stderrBytes);
      stderrChunks.push(bounded);
      stderrBytes += bounded.byteLength;
    });
    child.once("exit", (code, signal) => {
      this.#handleExit(
        child,
        ready,
        code,
        signal,
        Buffer.concat(stderrChunks).toString("utf8"),
      );
    });
    try {
      if (!sendIpcIfConnected(child, {
        type: "desktop.core.boot",
        authorizationToken,
        databasePath: this.#databasePath,
        clientInstanceId: this.#clientInstanceId,
        ...(credentialBroker === undefined ? {} : { sensitiveChannelInstanceId }),
        ...(this.#demoMode === undefined
          ? {}
          : { demoMode: this.#demoMode }),
        ...(this.#credentialHelperDescriptor === undefined
          ? {}
          : { credentialHelperDescriptor: this.#credentialHelperDescriptor }),
        ...(this.#dfi543TestHarness === undefined
          ? {}
          : { dfi543TestHarness: this.#dfi543TestHarness }),
        ...(this.#sensitiveTransportActivationDescriptor === undefined
          ? {}
          : {
            sensitiveTransportActivationDescriptor:
              this.#sensitiveTransportActivationDescriptor,
          }),
      })) {
        throw new Error("Local Core IPC channel is unavailable during startup");
      }
      const message = await waitForReady(child, this.#startTimeoutMs);
      if (this.#child !== child || this.#stopping) {
        throw new Error("Local Core stopped during startup");
      }
      this.#client = this.#createClient({
        baseUrl: `http://127.0.0.1:${message.port}`,
        authorizationToken,
      });
      this.#runtimeInstanceId = message.runtimeInstanceId;
      ready = true;
      this.#state = "ready";
    } catch (error) {
      this.#lastError = safeFailureSummary(error, Buffer.concat(stderrChunks).toString("utf8"));
      if (this.#child === child) {
        this.#child = undefined;
        this.#client = undefined;
        this.#runtimeInstanceId = undefined;
        this.#credentialBroker?.close();
        this.#credentialBroker = undefined;
        await this.#shutdownChild(child);
      }
      throw error;
    }
  }

  #handleExit(
    child: ChildProcess,
    wasReady: boolean,
    code: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ): void {
    if (this.#child !== child) return;
    this.#child = undefined;
    this.#client = undefined;
    this.#runtimeInstanceId = undefined;
    this.#credentialBroker?.close();
    this.#credentialBroker = undefined;
    if (this.#stopping) {
      this.#state = "stopped";
      return;
    }
    this.#lastError = safeExitSummary(code, signal, stderr);
    if (!wasReady) return;
    this.#beginAutomaticRecovery(new Error(this.#lastError));
  }

  #beginAutomaticRecovery(error: unknown): void {
    if (this.#recoveryPromise !== undefined || this.#stopping) return;
    const operation = this.#recoverAfterFailure(error);
    this.#recoveryPromise = operation;
    void operation.catch(() => undefined).finally(() => {
      if (this.#recoveryPromise === operation) this.#recoveryPromise = undefined;
    });
  }

  async #recoverAfterFailure(initialError: unknown): Promise<void> {
    let error = initialError;
    while (!this.#stopping) {
      this.#lastError = safeFailureSummary(error);
      if (this.#unexpectedRestartCount >= this.#maxUnexpectedRestarts) {
        this.#state = "failed";
        throw toError(error);
      }
      this.#unexpectedRestartCount += 1;
      this.#state = "restarting";
      await this.#wait(this.#restartDelayMs);
      if (this.#stopping) break;
      try {
        await this.#launch("restarting");
        return;
      } catch (nextError) {
        error = nextError;
      }
    }
    this.#state = "stopped";
    throw new Error("Local Core stopped during recovery");
  }

  #detachActiveChild(): ChildProcess | undefined {
    const child = this.#child;
    this.#child = undefined;
    this.#client = undefined;
    this.#runtimeInstanceId = undefined;
    this.#credentialBroker?.close();
    this.#credentialBroker = undefined;
    return child;
  }

  async #shutdownChild(child: ChildProcess | undefined): Promise<void> {
    if (child === undefined || child.exitCode !== null) return;
    const exited = onceExit(child);
    sendIpcIfConnected(child, { type: "desktop.core.shutdown" });
    const graceful = await Promise.race([
      exited.then(() => true),
      this.#wait(this.#stopTimeoutMs).then(() => false),
    ]);
    if (!graceful && child.exitCode === null) {
      child.kill("SIGTERM");
      const terminated = await Promise.race([
        exited.then(() => true),
        this.#wait(STOP_KILL_GRACE_MS).then(() => false),
      ]);
      if (!terminated && child.exitCode === null) {
        child.kill("SIGKILL");
        await Promise.race([
          exited,
          this.#wait(STOP_KILL_GRACE_MS),
        ]);
      }
    }
  }
}

export type CorePrivateConnectionLease = Readonly<{
  client: CorePrivateClient;
  runtimeInstanceId: string;
  transportClientInstanceId: string;
}>;

function spawnCoreChild(
  entryPath: string,
  testHarness = false,
  internalTrial?: InternalTrialCoreEnvironmentLease,
  privateInstalledSkillRoot?: string,
): ChildProcess {
  return fork(entryPath, [], {
    cwd: dirname(entryPath),
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: testHarness ? "test" : "production",
      ...(internalTrial?.deployment === undefined
        ? {}
        : { [INTERNAL_TRIAL_DEPLOYMENT_ENV]: internalTrial.deployment }),
      ...(internalTrial?.accessToken === undefined
        ? {}
        : { [INTERNAL_TRIAL_TOKEN_ENV]: internalTrial.accessToken.toString("utf8") }),
      ...(internalTrial?.agentLifecycleAccessToken === undefined
        ? {}
        : {
          [INTERNAL_TRIAL_AGENT_LIFECYCLE_TOKEN_ENV]:
            internalTrial.agentLifecycleAccessToken.toString("utf8"),
        }),
      ...(internalTrial?.skillLifecycleAccessToken === undefined
        ? {}
        : {
          [INTERNAL_TRIAL_SKILL_LIFECYCLE_TOKEN_ENV]:
            internalTrial.skillLifecycleAccessToken.toString("utf8"),
        }),
      ...(privateInstalledSkillRoot === undefined
        ? {} : { [PRIVATE_INSTALLED_SKILL_ROOT_ENV]: privateInstalledSkillRoot }),
    },
    execArgv: [],
    serialization: "json",
    stdio: ["ignore", "ignore", "pipe", "ipc", "pipe", "pipe"],
  });
}

function captureInternalTrialCoreEnvironment(
  environment: NodeJS.ProcessEnv,
): InternalTrialCoreEnvironmentLease | undefined {
  const deployment = environment[INTERNAL_TRIAL_DEPLOYMENT_ENV];
  const token = environment[INTERNAL_TRIAL_TOKEN_ENV];
  const agentLifecycleToken = environment[INTERNAL_TRIAL_AGENT_LIFECYCLE_TOKEN_ENV];
  const skillLifecycleToken = environment[INTERNAL_TRIAL_SKILL_LIFECYCLE_TOKEN_ENV];
  delete environment[INTERNAL_TRIAL_DEPLOYMENT_ENV];
  delete environment[INTERNAL_TRIAL_TOKEN_ENV];
  delete environment[INTERNAL_TRIAL_AGENT_LIFECYCLE_TOKEN_ENV];
  delete environment[INTERNAL_TRIAL_SKILL_LIFECYCLE_TOKEN_ENV];
  if (deployment === undefined && token === undefined && agentLifecycleToken === undefined
    && skillLifecycleToken === undefined) {
    return undefined;
  }
  // The supervisor supports stop/start reuse, so this privileged lease has the
  // Main-process lifetime and is never projected through IPC or Renderer.
  return Object.freeze({
    ...(deployment === undefined ? {} : { deployment }),
    ...(token === undefined ? {} : { accessToken: Buffer.from(token, "utf8") }),
    ...(agentLifecycleToken === undefined
      ? {}
      : { agentLifecycleAccessToken: Buffer.from(agentLifecycleToken, "utf8") }),
    ...(skillLifecycleToken === undefined
      ? {}
      : { skillLifecycleAccessToken: Buffer.from(skillLifecycleToken, "utf8") }),
  });
}

export async function resolveInternalTrialCoreEnvironment(
  lease: InternalTrialCoreEnvironmentLease | undefined,
  fetchImpl: Fetch,
): Promise<InternalTrialCoreEnvironmentLease | undefined> {
  if (lease?.deployment === undefined) return lease;
  const discovery = parseAdminModelDiscoveryRequest(lease.deployment);
  if (discovery === undefined) return lease;
  if (lease.accessToken === undefined) return undefined;
  const origin = validateInternalTrialCentralOrigin(discovery.centralBaseUrl);
  try {
    const response = await fetchImpl(new URL(
      "/internal-trial/v1/admin-models/default",
      origin,
    ), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${lease.accessToken.toString("utf8")}`,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return undefined;
    }
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) > 32_768) {
      await response.body?.cancel();
      return undefined;
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > 32_768) return undefined;
    const model = parseAdminModelDiscoveryResponse(body);
    return Object.freeze({
      deployment: JSON.stringify({ ...model, centralBaseUrl: origin.toString() }),
      accessToken: lease.accessToken,
    });
  } catch {
    return undefined;
  }
}

function parseAdminModelDiscoveryRequest(
  encoded: string,
): Readonly<{ centralBaseUrl: string }> | undefined {
  if (Buffer.byteLength(encoded, "utf8") > 16_384) return undefined;
  try {
    const value = JSON.parse(encoded) as unknown;
    if (!isRecord(value)
      || !hasExactKeys(value, ["centralBaseUrl", "schemaVersion"])
      || value.schemaVersion !== "mvp-admin-vs1.discovery.v1"
      || typeof value.centralBaseUrl !== "string") return undefined;
    return Object.freeze({ centralBaseUrl: value.centralBaseUrl });
  } catch {
    return undefined;
  }
}

function parseAdminModelDiscoveryResponse(encoded: string): Readonly<{
  schemaVersion: "mvp-admin-vs1.internal-trial.v1";
  configurationRevision: string;
  modelId: string;
  modelCreatedAt: string;
  displayName: string;
  supportsToolCalling: true;
  contextWindowTokens: number;
  maxOutputTokens: number;
}> {
  const value = JSON.parse(encoded) as unknown;
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "configurationRevision",
      "contextWindowTokens",
      "displayName",
      "maxOutputTokens",
      "modelCreatedAt",
      "modelId",
      "schemaVersion",
      "supportsToolCalling",
    ])
    || value.schemaVersion !== "mvp-admin-vs1.internal-trial.v1"
    || typeof value.configurationRevision !== "string"
    || !/^sha256:[a-f0-9]{64}$/u.test(value.configurationRevision)
    || typeof value.modelId !== "string"
    || !/^model\.[A-Za-z0-9._:-]{1,154}$/u.test(value.modelId)
    || typeof value.modelCreatedAt !== "string"
    || Number.isNaN(Date.parse(value.modelCreatedAt))
    || typeof value.displayName !== "string"
    || value.displayName.trim().length === 0
    || value.displayName.length > 160
    || value.supportsToolCalling !== true
    || !Number.isSafeInteger(value.contextWindowTokens)
    || (value.contextWindowTokens as number) < 8_192
    || (value.contextWindowTokens as number) > 1_048_576
    || !Number.isSafeInteger(value.maxOutputTokens)
    || (value.maxOutputTokens as number) < 256
    || (value.maxOutputTokens as number) > 262_144
    || (value.maxOutputTokens as number) > (value.contextWindowTokens as number)) {
    throw new Error("Admin-managed internal-trial model discovery is invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    configurationRevision: value.configurationRevision,
    modelId: value.modelId,
    modelCreatedAt: value.modelCreatedAt,
    displayName: value.displayName.trim(),
    supportsToolCalling: true,
    contextWindowTokens: value.contextWindowTokens as number,
    maxOutputTokens: value.maxOutputTokens as number,
  });
}

function validateInternalTrialCentralOrigin(value: string): URL {
  const origin = new URL(value);
  const loopback = origin.protocol === "http:"
    && (origin.hostname === "127.0.0.1" || origin.hostname === "localhost");
  if (origin.protocol !== "https:" && !loopback) throw new Error("invalid Central origin");
  if (origin.username !== "" || origin.password !== ""
    || origin.search !== "" || origin.hash !== ""
    || (origin.pathname !== "" && origin.pathname !== "/")) {
    throw new Error("invalid Central origin");
  }
  return origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function getSensitiveStreams(
  child: ChildProcess,
): Readonly<{ request: Writable; response: Readable }> | undefined {
  const stdio = child.stdio as ReadonlyArray<Writable | Readable | null | undefined> | undefined;
  if (stdio === undefined) return undefined;
  const request = stdio[4];
  const response = stdio[5];
  if (request === null || request === undefined
    || response === null || response === undefined
    || typeof (request as Writable).write !== "function"
    || typeof (response as Readable).on !== "function") return undefined;
  return { request: request as Writable, response: response as Readable };
}

function waitForReady(
  child: ChildProcess,
  timeoutMs: number,
): Promise<CoreReadyMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Local Core readiness timed out"));
    }, timeoutMs);
    const onMessage = (message: unknown): void => {
      if (isReady(message)) {
        cleanup();
        resolve(message);
      } else if (
        typeof message === "object"
        && message !== null
        && (message as { type?: unknown }).type === "desktop.core.failed"
      ) {
        cleanup();
        reject(new Error("Local Core failed during startup"));
      }
    };
    const onExit = (): void => {
      cleanup();
      reject(new Error("Local Core exited before readiness"));
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function isReady(value: unknown): value is CoreReadyMessage {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return item.type === "desktop.core.ready"
    && item.host === "127.0.0.1"
    && Number.isInteger(item.port)
    && (item.port as number) > 0
    && (item.port as number) <= 65_535
    && typeof item.runtimeInstanceId === "string"
    && typeof item.coreVersion === "string";
}

function onceExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

function sendIpcIfConnected(child: ChildProcess, message: Serializable): boolean {
  if (!child.connected || child.exitCode !== null) return false;
  try {
    child.send(message, () => {
      // Delivery failure is observed through readiness/exit state. Supplying a
      // callback prevents a closed IPC pipe from becoming an unhandled error.
    });
    return true;
  } catch {
    return false;
  }
}

function safeExitSummary(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): string {
  const bounded = redactDiagnostic(stderr).slice(0, 512);
  return `code=${String(code)} signal=${String(signal)} stderr=${bounded || "none"}`;
}

function safeFailureSummary(error: unknown, stderr = ""): string {
  const reason = error instanceof Error ? error.name : "UnknownError";
  const boundedStderr = redactDiagnostic(stderr).slice(0, 256);
  return `reason=${reason} stderr=${boundedStderr || "none"}`;
}

function redactDiagnostic(value: string): string {
  return value
    .replaceAll(/Bearer\s+\S+/giu, "Bearer <redacted>")
    .replaceAll(/\/(?:Users|private|tmp|var)\/[^\s]+/gu, "<path>")
    .replaceAll(/[A-Za-z0-9_-]{32,}/gu, "<redacted>")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Local Core lifecycle failure");
}
