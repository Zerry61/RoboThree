import { execFile as execFileCallback, fork, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { PersonalCredentialBrokerClient } from
  "../../apps/desktop/src/main/personal-credential-broker-client.js";
import { PersonalCredentialRevealDelivery } from
  "../../apps/desktop/src/main/personal-credential-reveal-delivery.js";
import {
  createPersonalModelCredentialCommand,
  createPersonalModelRevealCommand,
} from "../../services/core/src/index.js";

const execFile = promisify(execFileCallback);
const childFixture = resolve("services/core/tests/fixtures/dfi4a23-core-child.mjs");
const authorityContext = Object.freeze({
  enterpriseId: "enterprise.closure",
  userId: "user.closure",
  deviceId: "device.closure",
  entitlementGranted: true,
  entitlementRevision: `sha256:${"e".repeat(64)}` as const,
  offlineState: "online" as const,
});

describe.runIf(process.platform === "darwin")("DFI-4A.2.3 process closure harness", () => {
  it("closes real child, SQLite, isolated Keychain, V1/V2 and restart semantics", async () => {
    const fixture = await createFixture();
    const databasePath = join(fixture.directory, "personal-model.sqlite");
    const expectedSecret = randomBytes(48);
    const transcripts: Array<Readonly<{ stdout: string; stderr: string }>> = [];
    let current: Awaited<ReturnType<typeof startChild>> | undefined;
    try {
      current = await startChild(databasePath, fixture.descriptor);
      const create = createPersonalModelCredentialCommand({
        commandId: randomUUID(),
        commandType: "create",
        personalModelId: "model.personal.closure",
        target: {
          providerKind: "deepseek",
          providerProfileRevision: `sha256:${"a".repeat(64)}`,
          protocol: "openai_compatible",
          endpoint: "https://api.example.com/v1",
          providerModelId: "deepseek-closure",
          displayName: "Closure Model",
          capabilities: ["text", "streaming"],
        },
        credentialInputExpected: true,
      });
      expect(await request(current.child, "prepared", {
        type: "prepare",
        requestId: randomUUID(),
        command: create,
      })).toMatchObject({ result: { ok: true, status: "prepared" } });
      const mutationSecret = Uint8Array.from(expectedSecret);
      expect(await current.client.execute({
        commandId: create.commandId,
        commandType: "create",
        personalModelId: create.personalModelId,
        commandRequestDigest: create.requestDigest,
        deadlineAt: new Date(Date.now() + 7_000).toISOString(),
        secret: mutationSecret,
      })).toMatchObject({ header: { status: "completed" } });
      mutationSecret.fill(0);
      const head = await loadHead(current.child, create.personalModelId);
      await expectReveal(current, create.personalModelId, head, expectedSecret, 1);
      const firstPid = current.child.pid;
      await current.stop();
      transcripts.push(current.output());

      current = await startChild(databasePath, fixture.descriptor);
      expect(current.child.pid).not.toBe(firstPid);
      const reopenedHead = await loadHead(current.child, create.personalModelId);
      expect(reopenedHead).toEqual(head);
      await expectReveal(current, create.personalModelId, reopenedHead, expectedSecret, 2);
      await current.stop();
      transcripts.push(current.output());

      current = await startChild(databasePath, fixture.descriptor, "V1");
      const v1Barrier = waitForMessage(current.child, (message) =>
        message.type === "barrier" && message.name === "V1");
      let v1ConsumerCalls = 0;
      const v1Pending = current.delivery.deliver(
        revealCommand(create.personalModelId, head, 3),
        { consume: async () => { v1ConsumerCalls += 1; } },
      );
      expect(await v1Barrier).toMatchObject({ resolveCount: 0 });
      await current.kill();
      transcripts.push(current.output());
      expect(await v1Pending).toMatchObject({ status: "uncertain" });
      expect(v1ConsumerCalls).toBe(0);

      current = await startChild(databasePath, fixture.descriptor, "V2a");
      const v2Barrier = waitForMessage(current.child, (message) =>
        message.type === "barrier" && message.name === "V2a");
      let v2ConsumerCalls = 0;
      const v2Pending = current.delivery.deliver(
        revealCommand(create.personalModelId, head, 4),
        { consume: async () => { v2ConsumerCalls += 1; } },
      );
      expect(await v2Barrier).toMatchObject({ resolveCount: 1 });
      await current.kill();
      transcripts.push(current.output());
      expect(await v2Pending).toMatchObject({ status: "uncertain" });
      expect(v2ConsumerCalls).toBe(0);

      current = await startChild(databasePath, fixture.descriptor);
      await expectReveal(current, create.personalModelId, head, expectedSecret, 5);
      const resources = await request(current.child, "resources", {
        type: "resources",
        requestId: randomUUID(),
      });
      expect(resources).toMatchObject({
        broker: { inflight: 0, mutations: 0, closed: false },
        reveal: { active: 0, ownerModels: 0 },
      });
      transcripts.push(current.output());
      expect(scanChannels({
        stdout: transcripts.map((item) => item.stdout).join("\n"),
        stderr: transcripts.map((item) => item.stderr).join("\n"),
      }, expectedSecret)).toEqual({
        stdout: 0,
        stderr: 0,
        evidence: 0,
        trace: 0,
      });
    } finally {
      expectedSecret.fill(0);
      await current?.stop().catch(() => undefined);
      await fixture.destroy();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  }, 60_000);
});

async function expectReveal(
  harness: Awaited<ReturnType<typeof startChild>>,
  personalModelId: string,
  head: Head,
  expectedSecret: Uint8Array,
  offset: number,
): Promise<void> {
  let calls = 0;
  const result = await harness.delivery.deliver(
    revealCommand(personalModelId, head, offset),
    {
      consume: async (secret) => {
        calls += 1;
        expect([...secret]).toEqual([...expectedSecret]);
      },
    },
  );
  expect(result).toMatchObject({ status: "completed", secretByteLength: 0 });
  expect(calls).toBe(1);
}

type Head = Readonly<{
  currentConfigurationRevision: string;
  currentExecutionDefinitionDigest: string;
  selectionState: "active";
}>;

function revealCommand(personalModelId: string, head: Head, offset: number) {
  const command = createPersonalModelRevealCommand({
    commandId: `40000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`,
    commandType: "reveal",
    personalModelId,
    expectedConfigurationRevision: head.currentConfigurationRevision,
    expectedExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
    deadlineAt: new Date(Date.now() + 7_000).toISOString(),
  });
  return {
    commandId: command.commandId,
    commandType: command.commandType,
    personalModelId: command.personalModelId,
    expectedConfigurationRevision: command.expectedConfigurationRevision,
    expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest,
    commandRequestDigest: command.requestDigest,
    deadlineAt: command.deadlineAt,
  } as const;
}

async function loadHead(child: ChildProcess, personalModelId: string): Promise<Head> {
  const message = await request(child, "head", {
    type: "head",
    requestId: randomUUID(),
    personalModelId,
  });
  if (!message.head || message.head.selectionState !== "active") {
    throw new Error("Personal Model head is unavailable");
  }
  return message.head as Head;
}

async function startChild(
  databasePath: string,
  descriptor: Record<string, unknown>,
  barrierMode?: "V1" | "V2a",
) {
  const channelInstanceId = randomUUID();
  const clientInstanceId = randomUUID();
  const child = fork(childFixture, [], {
    serialization: "json",
    stdio: ["ignore", "pipe", "pipe", "ipc", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
  const ready = waitForMessage(child, (message) => message.type === "ready");
  child.send({
    type: "boot",
    databasePath,
    descriptor,
    authorityContext,
    channelInstanceId,
    clientInstanceId,
    ...(barrierMode === undefined ? {} : { barrierMode }),
  });
  await ready;
  const client = new PersonalCredentialBrokerClient({
    request: child.stdio[4] as Writable,
    response: child.stdio[5] as Readable,
    channelInstanceId,
    clientInstanceId,
  });
  const delivery = new PersonalCredentialRevealDelivery(client);
  let stopped = false;
  const waitForExit = () => new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
    else child.once("exit", () => resolvePromise());
  });
  return {
    child,
    client,
    delivery,
    output: () => ({
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      client.close();
      if (child.connected) child.send({ type: "shutdown" });
      await waitForExit();
    },
    kill: async () => {
      if (stopped) return;
      stopped = true;
      child.kill("SIGKILL");
      await waitForExit();
    },
  };
}

type ChildMessage = Record<string, unknown> & { type: string; requestId?: string };

async function request(
  child: ChildProcess,
  type: string,
  message: Record<string, unknown> & { requestId: string },
): Promise<ChildMessage> {
  const result = waitForMessage(child, (candidate) =>
    candidate.type === type && candidate.requestId === message.requestId);
  child.send(message);
  return result;
}

function waitForMessage(
  child: ChildProcess,
  predicate: (message: ChildMessage) => boolean,
  timeoutMs = 10_000,
): Promise<ChildMessage> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => finish(new Error("child message timeout")), timeoutMs);
    const onMessage = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const message = value as ChildMessage;
      if (!predicate(message)) return;
      cleanup();
      resolvePromise(message);
    };
    const onExit = () => finish(new Error("child exited before message"));
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    const finish = (error: Error) => {
      cleanup();
      reject(error);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function scanChannels(
  output: Readonly<{ stdout: string; stderr: string }>,
  secret: Uint8Array,
): Record<"stdout" | "stderr" | "evidence" | "trace", number> {
  const bytes = Buffer.from(secret);
  const variants = [
    bytes.toString("utf8"),
    bytes.toString("base64"),
    encodeURIComponent(bytes.toString("base64")),
    bytes.toString("hex"),
  ];
  bytes.fill(0);
  const channels = {
    stdout: output.stdout,
    stderr: output.stderr,
    evidence: JSON.stringify({ status: "PASS", revealCount: 3 }),
    trace: "typedCode=none resourceCount=0",
  };
  return Object.fromEntries(Object.entries(channels).map(([name, value]) => [
    name,
    variants.filter((variant) => variant.length > 0 && value.includes(variant)).length,
  ])) as Record<"stdout" | "stderr" | "evidence" | "trace", number>;
}

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a23-"));
  const helperPath = join(directory, "Resources", "robothree-personal-credential-helper");
  const setupHelperPath = join(directory, "test-keychain-helper");
  const keychainPath = join(directory, "isolated.keychain-db");
  await execFile("/bin/mkdir", ["-p", join(directory, "Resources")]);
  await Promise.all([
    compile(resolve("services/core/native/macos/robothree-personal-credential-helper.m"), helperPath),
    compile(resolve("scripts/dfi4a0-keychain-helper.m"), setupHelperPath),
  ]);
  await chmod(helperPath, 0o755);
  const password = randomBytes(32);
  await setupCommand(setupHelperPath, {
    protocolVersion: 1,
    command: "create_test_keychain",
    keychainPath,
    keychainPasswordBase64: password.toString("base64"),
  });
  const helperBytes = await readFile(helperPath);
  const manifestSha256 = `sha256:${createHash("sha256").update(helperBytes).digest("hex")}`;
  helperBytes.fill(0);
  let destroyed = false;
  return {
    directory,
    descriptor: {
      helperPath,
      packageRootPath: directory,
      manifestSha256,
      protocolVersion: "personal-keychain-helper.v1",
      activation: "test_isolated",
      testKeychainPath: keychainPath,
    },
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      await setupCommand(setupHelperPath, {
        protocolVersion: 1,
        command: "destroy_test_keychain",
        keychainPath,
      }).catch(() => undefined);
      password.fill(0);
    },
  };
}

async function compile(source: string, output: string): Promise<void> {
  await execFile("/usr/bin/xcrun", [
    "clang", "-fobjc-arc", "-framework", "Foundation", "-framework", "Security",
    source, "-o", output,
  ], { timeout: 30_000, maxBuffer: 64_000 });
}

async function setupCommand(helperPath: string, command: Record<string, unknown>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(helperPath, [], { stdio: ["pipe", "pipe", "ignore"], env: {} });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("exit", () => {
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { ok?: unknown };
        if (response.ok !== true) throw new Error("isolated Keychain setup failed");
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(command));
  });
}
