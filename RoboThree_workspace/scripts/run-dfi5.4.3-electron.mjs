import { execFile, execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import electron from "electron";
import {
  MacOsKeychainPersonalCredentialStore,
  LocalPersonalAdmittedReasoningProfileSource,
  LocalPersonalEffectiveReasoningModelResolver,
  PersonalModelProviderProfileRegistry,
  SqliteDesktopFoundationPersistence,
  SqlitePersonalModelPersistence,
  SystemClock,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelCommandReceipt,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOperation,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  deriveLocalDesktopSubjectAuthority,
} from "../services/core/dist/index.js";
import { CorePrivateSupervisor } from
  "../apps/desktop/dist/main/core-private-supervisor.js";
import { DesktopIpcRouter } from "../apps/desktop/dist/main/desktop-ipc-router.js";
import { DesktopV1Alpha4IpcRouter } from
  "../apps/desktop/dist/main/desktop-v1alpha4-ipc-router.js";
import { DesktopV1Alpha5IpcRouter } from
  "../apps/desktop/dist/main/desktop-v1alpha5-ipc-router.js";
import { DesktopTaskReasoningV1Alpha1IpcRouter } from
  "../apps/desktop/dist/main/desktop-task-reasoning-v1alpha1-ipc-router.js";
import { createSecureWindowOptions } from
  "../apps/desktop/dist/main/window-security.js";
import {
  DESKTOP_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
} from "../apps/desktop/dist/shared/foundation-api.js";

const { app, BrowserWindow, ipcMain } = electron;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const at = "2026-08-28T00:00:00.000Z";
const digest = (marker) => `sha256:${marker.repeat(64)}`;

app.on("window-all-closed", () => undefined);
void app.whenReady().then(run).then((evidence) => {
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${safeCode(error)}\n`);
  app.exit(1);
});

async function run() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi543-electron-"));
  const databasePath = join(directory, "robothree.sqlite");
  const keychain = await createKeychainFixture(directory);
  const tls = await createTlsFixture(directory);
  const provider = await startProviderFixture(tls);
  const modelId = "model.personal.dfi543-e2e";
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 54));
  const operationId = "019f7447-a784-47b2-a716-000000005431";
  const secret = Uint8Array.from(Buffer.from("dfi543-controlled-provider-key", "utf8"));
  let supervisor;
  let window;
  const handlers = [];
  let semanticEvidence;
  const cleanup = {
    browserWindowCount: 1,
    webContentsCount: 1,
    ipcHandlerCount: 0,
    coreChildCount: 1,
    tlsServerCount: 1,
    listeningPortCount: 1,
    temporaryDirectoryCount: 1,
    keychainCount: 1,
  };
  try {
    const credentialStore = new MacOsKeychainPersonalCredentialStore({ descriptor: keychain.descriptor });
    await credentialStore.start();
    const stored = await credentialStore.store(operationId, credentialRef, secret);
    secret.fill(0);
    if (!stored.ok) throw new Error("dfi543_credential_seed_failed");
    await credentialStore.stop();
    await seedDatabase({ databasePath, modelId, credentialRef, operationId, providerPort: provider.port });

    supervisor = new CorePrivateSupervisor({
      entryPath: join(root, "services/core/dist/desktop-private-main.js"),
      databasePath,
      maxUnexpectedRestarts: 1,
      dfi543TestHarness: {
        credentialHelperDescriptor: keychain.descriptor,
        providerCaPem: tls.cert.toString("utf8"),
        providerPort: provider.port,
      },
    });
    await supervisor.start();
    const routers = registerRouters(supervisor, handlers);
    window = new BrowserWindow(createSecureWindowOptions(
      join(root, "apps/desktop/dist/preload/index.cjs"),
    ));
    const clearBinding = () => {
      routers.v1alpha5.removeWebContents(window.webContents.id);
      routers.taskReasoning.removeWebContents(window.webContents.id);
    };
    window.webContents.on("did-start-navigation", clearBinding);
    await window.loadURL("data:text/html;charset=utf-8,<main>DFI-5.4.3 driver</main>");
    const submitted = await window.webContents.executeJavaScript(driverScript(modelId), true);
    if (submitted?.receipt?.runtimeSelectionSummary?.reasoning?.resolutionReason !== "applied") {
      throw new Error("dfi543_max_resolution_not_applied");
    }
    const providerRequest = await provider.request;
    if (providerRequest.reasoningEffort !== "xhigh") {
      throw new Error("dfi543_provider_mapping_invalid");
    }
    const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
    const firstCorePid = findCoreChildPid();
    const namedCrashBarrier = "provider_response_committed_before_task_summary_read";
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
    const secondRuntimeInstanceId = supervisor.runtimeInstanceId;
    if (firstRuntimeInstanceId === secondRuntimeInstanceId) {
      throw new Error("dfi543_core_restart_identity_invalid");
    }
    clearBinding();
    await window.loadFile(join(root, "apps/desktop/dist/renderer/index.html"), {
      hash: "/tasks",
    });
    const dom = await window.webContents.executeJavaScript(domEvidenceScript(), true);
    if (dom?.taskReasoningSummary !== "Max") {
      throw new Error("dfi543_task_reasoning_dom_missing");
    }
    const preferences = window.webContents.getLastWebPreferences();
    semanticEvidence = {
      status: "PASS",
      realElectronMain: true,
      realRendererDom: dom.realRendererDom === true,
      realMainIpc: true,
      realCoreChild: true,
      realSqliteReopen: true,
      realTlsSseProvider: true,
      providerReasoningEffort: providerRequest.reasoningEffort,
      taskReasoningSummary: dom.taskReasoningSummary,
      testIdentityUsed: submitted.preview.testIdentityUsed === true,
      productionIdentityReady: submitted.preview.productionIdentityReady === true,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
      firstRuntimeInstanceId,
      secondRuntimeInstanceId,
      firstCorePid,
      namedCrashBarrier,
      sigkillObserved: true,
      reasoningResolutionReason:
        submitted.receipt.runtimeSelectionSummary.reasoning.resolutionReason,
      effectiveModelId: submitted.preview.effectiveModelId,
    };
  } finally {
    secret.fill(0);
    window?.destroy();
    cleanup.browserWindowCount = BrowserWindow.getAllWindows().length;
    cleanup.webContentsCount = window?.isDestroyed() === true ? 0 : 1;
    for (const channel of handlers.splice(0)) ipcMain.removeHandler(channel);
    cleanup.ipcHandlerCount = handlers.length;
    await supervisor?.stop().catch(() => undefined);
    cleanup.coreChildCount = supervisor?.snapshot().runtimeState === "stopped" ? 0 : 1;
    await provider.close().catch(() => undefined);
    cleanup.tlsServerCount = provider.closed() ? 0 : 1;
    cleanup.listeningPortCount = provider.closed() ? 0 : 1;
    await keychain.destroy().catch(() => undefined);
    cleanup.keychainCount = keychain.destroyed() ? 0 : 1;
    await rm(directory, { recursive: true, force: true });
    cleanup.temporaryDirectoryCount = 0;
  }
  if (semanticEvidence === undefined) throw new Error("dfi543_semantic_evidence_missing");
  return { ...semanticEvidence, resourceCounts: cleanup };
}

function findCoreChildPid() {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  }).split("\n");
  const matches = rows.map((row) => row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match) => match !== null
      && Number(match[2]) === process.pid
      && match[3].includes("desktop-private-main.js"));
  if (matches.length !== 1) throw new Error("dfi543_core_child_identity_invalid");
  return Number(matches[0][1]);
}

async function observeExitedProcess(pid) {
  await waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  }, "dfi543_sigkill_not_observed");
}

async function waitForSupervisorRecovery(supervisor, previousRuntimeInstanceId) {
  await waitFor(() => supervisor.snapshot().runtimeState === "ready"
    && supervisor.runtimeInstanceId !== previousRuntimeInstanceId,
  "dfi543_core_recovery_timeout");
}

async function waitFor(predicate, code) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(code);
}

function registerRouters(supervisor, handlers) {
  const base = new DesktopIpcRouter({
    core: {
      get client() { return supervisor.client; },
      snapshot: () => supervisor.snapshot(),
    },
    chooseWorkspaceDirectory: async () => undefined,
  });
  for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) {
    if (channel === DESKTOP_IPC_CHANNELS.desktopEvent) continue;
    ipcMain.handle(channel, (_event, input) => base.dispatch(channel, input));
    handlers.push(channel);
  }
  const v1alpha4 = new DesktopV1Alpha4IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(DESKTOP_V1ALPHA4_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) => v1alpha4.dispatch(channel, input, event));
    handlers.push(channel);
  }
  const v1alpha5 = new DesktopV1Alpha5IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(DESKTOP_V1ALPHA5_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) => v1alpha5.dispatch(channel, input, event));
    handlers.push(channel);
  }
  const taskReasoning = new DesktopTaskReasoningV1Alpha1IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) => taskReasoning.dispatch(channel, input, event));
    handlers.push(channel);
  }
  return { v1alpha5, taskReasoning };
}

async function seedDatabase(input) {
  const clock = new SystemClock();
  const personal = new SqlitePersonalModelPersistence({ databasePath: input.databasePath, clock });
  const foundation = new SqliteDesktopFoundationPersistence({ databasePath: input.databasePath, clock });
  await personal.start();
  await foundation.start();
  try {
    const namespace = createPersonalModelOwnerNamespace({
      namespaceRevision: 1,
      namespaceKey: Buffer.alloc(32, 54),
      createdAt: at,
    });
    const initialized = await personal.initializeOwnerNamespace(namespace);
    if (!initialized.ok) throw new Error("dfi543_namespace_seed_failed");
    const authority = deriveLocalDesktopSubjectAuthority(namespace);
    const owner = {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    };
    const credentialBindingDigest = calculateCredentialBindingDigest({
      credentialRef: input.credentialRef,
      createdByOperationId: input.operationId,
      credentialRevision: 1,
    });
    const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
    const definition = createPersonalModelDefinition({
      ownerIdentity: owner,
      personalModelId: input.modelId,
      providerKind: "custom",
      providerProfileRevision: profile.profileRevision,
      protocol: "openai_compatible",
      endpoint: "https://api.openai.com/v1",
      providerModelId: "gpt-5.2-2025-12-11",
      displayName: "DFI-5.4.3 controlled model",
      capabilities: ["text", "streaming", "tool_calling"],
      credentialRef: input.credentialRef,
      credentialRevision: 1,
      credentialBindingDigest,
      createdAt: at,
    });
    const requestDigest = digest("5");
    const intent = createPersonalModelOperation({
      ...owner,
      commandId: input.operationId,
      operationType: "create",
      requestDigest,
      targetModelId: input.modelId,
      targetConfigurationRevision: definition.configurationRevision,
      targetExecutionDefinitionDigest: definition.executionDefinitionDigest,
      targetCredentialRef: input.credentialRef,
      targetDefinition: definition,
      operationPhase: "intent_committed",
      phaseRevision: 1,
      createdAt: at,
      updatedAt: at,
    });
    const observation = {
      state: "present",
      credentialRef: input.credentialRef,
      createdByOperationId: input.operationId,
      credentialRevision: 1,
      credentialBindingDigest,
    };
    const observed = createPersonalModelOperation({
      ...withoutDigests(intent),
      operationPhase: "credential_step_observed",
      phaseRevision: 2,
      credentialObservation: observation,
    });
    const operation = createPersonalModelOperation({
      ...withoutDigests(observed),
      operationPhase: "committed",
      phaseRevision: 3,
    });
    const head = createPersonalModelHead({
      ...owner,
      personalModelId: input.modelId,
      currentConfigurationRevision: definition.configurationRevision,
      currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
      headRevision: 1,
      selectionState: "active",
      updatedAt: at,
    });
    const status = createPersonalModelStatusFact({
      ...owner,
      personalModelId: input.modelId,
      configurationRevision: definition.configurationRevision,
      executionDefinitionDigest: definition.executionDefinitionDigest,
      statusRevision: 1,
      status: "available",
      statusOrigin: "initialized",
      updatedAt: at,
    });
    const receipt = createPersonalModelCommandReceipt({
      ...owner,
      commandId: input.operationId,
      commandType: "create",
      requestDigest,
      modelId: input.modelId,
      committedConfigurationRevision: definition.configurationRevision,
      outcome: "create_committed",
      committedAt: at,
    });
    if (!(await personal.beginCredentialOperation(intent)).ok
      || !(await personal.advanceCredentialObservation({
        ownerIdentity: owner,
        commandId: input.operationId,
        expectedPhase: "intent_committed",
        operation: observed,
      })).ok
      || !(await personal.commitCreateOutcome({ operation, definition, head, status, receipt })).ok) {
      throw new Error("dfi543_personal_model_seed_failed");
    }
    const resolved = await new LocalPersonalEffectiveReasoningModelResolver(personal).resolve({
      contractVersion: "v1alpha3",
      queryId: "019f7447-a784-47b2-a716-000000005433",
      correlationId: "019f7447-a784-47b2-a716-000000005434",
      clientInstanceId: "019f7447-a784-47b2-a716-000000005435",
      agentId: "agent.general",
      requestedModelId: input.modelId,
    });
    if (await new LocalPersonalAdmittedReasoningProfileSource({ personal })
      .loadExact(resolved.subject) === undefined) {
      throw new Error("dfi543_seed_profile_unavailable");
    }
    const workspace = await foundation.commitWorkspaceGrantCreation({
      record: {
        workspaceGrantId: "workspace:dfi543-e2e",
        displayName: "DFI-5.4.3 Workspace",
        rootDisplayPath: "DFI-5.4.3 Workspace",
        rootRealPath: input.databasePath.slice(0, input.databasePath.lastIndexOf("/")),
        accessMode: "read_write",
        status: "active",
        createdAt: at,
      },
      commandId: "019f7447-a784-47b2-a716-000000005432",
      requestDigest: digest("6"),
      committedAt: at,
    });
    if (!workspace.ok) throw new Error("dfi543_workspace_seed_failed");
  } finally {
    await foundation.stop();
    await personal.stop();
  }
}

function withoutDigests(operation) {
  const material = { ...operation };
  delete material.recordDigest;
  delete material.credentialObservationDigest;
  return material;
}

async function startProviderFixture(tls) {
  let resolveRequest;
  const request = new Promise((resolvePromise) => { resolveRequest = resolvePromise; });
  const server = createServer({ key: tls.key, cert: tls.cert }, (incoming, response) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    incoming.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      resolveRequest({
        reasoningEffort: body.reasoning_effort,
        authorizationPresent: typeof incoming.headers.authorization === "string",
      });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "完成" }, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } })}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("dfi543_tls_fixture_failed");
  let closed = false;
  return {
    port: address.port,
    request: withTimeout(request, 20_000, "dfi543_provider_request_timeout"),
    close: () => new Promise((resolvePromise) => server.close(() => {
      closed = true;
      resolvePromise();
    })),
    closed: () => closed,
  };
}

async function createTlsFixture(directory) {
  const keyPath = join(directory, "provider.key");
  const certPath = join(directory, "provider.crt");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=api.openai.com",
    "-addext", "subjectAltName=DNS:api.openai.com",
  ], { stdio: "ignore" });
  return { key: await readFile(keyPath), cert: await readFile(certPath) };
}

async function createKeychainFixture(directory) {
  const resources = join(directory, "Resources");
  await mkdir(resources, { recursive: true });
  const helperPath = join(resources, "robothree-personal-credential-helper");
  const setupHelperPath = join(directory, "test-keychain-helper");
  const keychainPath = join(directory, "isolated.keychain-db");
  await Promise.all([
    compile(join(root, "services/core/native/macos/robothree-personal-credential-helper.m"), helperPath),
    compile(join(root, "scripts/dfi4a0-keychain-helper.m"), setupHelperPath),
  ]);
  const password = randomBytes(32);
  await setupCommand(setupHelperPath, {
    protocolVersion: 1,
    command: "create_test_keychain",
    keychainPath,
    keychainPasswordBase64: password.toString("base64"),
  });
  const bytes = await readFile(helperPath);
  const descriptor = {
    helperPath,
    packageRootPath: directory,
    manifestSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    protocolVersion: "personal-keychain-helper.v1",
    activation: "test_isolated",
    testKeychainPath: keychainPath,
  };
  let destroyed = false;
  return {
    descriptor,
    destroy: async () => {
      try {
        await setupCommand(setupHelperPath, {
          protocolVersion: 1,
          command: "destroy_test_keychain",
          keychainPath,
        });
      } finally {
        password.fill(0);
        destroyed = true;
      }
    },
    destroyed: () => destroyed,
  };
}

async function compile(source, output) {
  await new Promise((resolvePromise, reject) => execFile("/usr/bin/xcrun", [
    "clang", "-fobjc-arc", "-framework", "Foundation", "-framework", "Security",
    source, "-o", output,
  ], { timeout: 30_000, maxBuffer: 64_000 }, (error) => error ? reject(error) : resolvePromise()));
}

async function setupCommand(helperPath, command) {
  await new Promise((resolvePromise, reject) => {
    const child = execFile(helperPath, [], { env: {} }, (error, stdout) => {
      if (error) return reject(error);
      try {
        if (JSON.parse(stdout).ok !== true) throw new Error("dfi543_keychain_setup_failed");
        resolvePromise();
      } catch (parseError) { reject(parseError); }
    });
    child.stdin.end(JSON.stringify(command));
  });
}

function driverScript(modelId) {
  return `(async () => {
    let sequence = 5500;
    const id = () => "019f7447-a784-47b2-a716-" + String(sequence++).padStart(12, "0");
    const clientInstanceId = id();
    const session = await window.robothreeDesktop.createSession({
      contractVersion:"v1alpha1", commandId:id(), correlationId:id(), clientInstanceId,
      type:"create_session", title:"DFI-5.4.3 E2E"
    });
    if (!session.ok) throw new Error(session.error.code);
    const compatibility = await window.robothreeDesktopV1Alpha5.getCompatibility({
      contractVersion:"v1alpha5", queryId:id(), correlationId:id(), clientInstanceId,
      supportedContractVersions:["v1alpha5"]
    });
    if (!compatibility.ok || compatibility.value.features[0].state !== "available") {
      throw new Error("dfi543_compatibility_unavailable");
    }
    const preview = await window.robothreeDesktopV1Alpha5.previewReasoningMode({
      contractVersion:"v1alpha5", queryId:id(), correlationId:id(), clientInstanceId,
      type:"preview_reasoning_mode", agentId:"agent.general", requestedModelId:${JSON.stringify(modelId)}
    });
    if (!preview.ok || preview.value.maxSupport !== "supported") {
      throw new Error("dfi543_preview_invalid:" + JSON.stringify(preview));
    }
    const preference = await window.robothreeDesktopV1Alpha5.updateReasoningModePreference({
      contractVersion:"v1alpha5", commandId:id(), correlationId:id(), clientInstanceId,
      type:"update_reasoning_mode_preference", expectedPreferenceRevision:0, requestedMode:"max"
    });
    if (!preference.ok) throw new Error(preference.error.code);
    const receipt = await window.robothreeDesktopV1Alpha5.submitTurn({
      contractVersion:"v1alpha5", commandId:id(), correlationId:id(), clientInstanceId,
      type:"submit_turn", clientTurnId:"turn:"+id(), sessionId:session.value.sessionId,
      userInput:"完成 DFI-5.4.3 真实链路验证", selectionRequest:{
        agentId:"agent.general", requestedModelId:${JSON.stringify(modelId)}, selectedSkillIds:[],
        selectedKnowledgeIds:[], workspaceGrantId:"workspace:dfi543-e2e",
        authorizationPreference:{schemaVersion:"v1alpha1",requestedMode:"manual_review"},
        reasoningPreference:{requestedMode:"max",observedMaxSupport:preview.value.maxSupport,
          observedMaxSupportRevision:preview.value.maxSupportRevision}
      }
    });
    if (!receipt.ok) throw new Error(receipt.error.code);
    return { preview: preview.value, receipt: receipt.value };
  })()`;
}

function domEvidenceScript() {
  return `(async () => {
    const waitFor = (predicate, code) => new Promise((resolve, reject) => {
      if (predicate()) return resolve();
      const observer = new MutationObserver(() => { if (predicate()) { observer.disconnect(); resolve(); } });
      observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
      setTimeout(() => { observer.disconnect(); reject(new Error(code)); }, 15000);
    });
    await waitFor(() => document.querySelector("[data-task-action='open']"), "dfi543_task_dom_timeout");
    document.querySelector("[data-task-action='open']").click();
    await waitFor(() => document.body.innerText.includes("推理模式") && document.body.innerText.includes("Max"),
      "dfi543_reasoning_dom_timeout");
    return { realRendererDom: document.querySelector("#app") !== null, taskReasoningSummary:"Max" };
  })()`;
}

function withTimeout(promise, timeoutMs, code) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolvePromise(value); },
      (error) => { clearTimeout(timer); reject(error); });
  });
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "dfi543_electron_failure";
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "dfi543_electron_failure";
}
