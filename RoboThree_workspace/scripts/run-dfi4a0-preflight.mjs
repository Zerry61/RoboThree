import { Buffer } from "node:buffer";
import { execFile as execFileCallback, spawn, fork } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { BlockList } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const keychainHelperSource = join(scriptDirectory, "dfi4a0-keychain-helper.m");
const ipcFixture = join(scriptDirectory, "dfi4a0-sensitive-child-fixture.mjs");
const corePrivateSupervisorSource = join(scriptDirectory, "../apps/desktop/src/main/core-private-supervisor.ts");
const leakChannels = Object.freeze([
  "parent_stdout",
  "diagnostic_stderr",
  "evidence_json",
  "test_trace",
]);
const evidence = {
  protocolVersion: 1,
  status: "PASS",
  keychain: {},
  childIpc: {},
  endpointTransport: {},
  leakScan: {},
};

class LeakScanner {
  #needles = [];
  #matches = new Map(leakChannels.map((channel) => [channel, []]));
  #negativeProbeCount = 0;

  trackText(label, value) {
    if (typeof value !== "string" || value.length === 0) return;
    this.#needles.push({ label, encoding: "raw", value });
    this.#needles.push({ label, encoding: "base64", value: Buffer.from(value, "utf8").toString("base64") });
    this.#needles.push({ label, encoding: "url", value: encodeURIComponent(value) });
    this.#needles.push({ label, encoding: "hex", value: Buffer.from(value, "utf8").toString("hex") });
  }

  trackBytes(label, value) {
    if (!Buffer.isBuffer(value) || value.length === 0) return;
    this.#needles.push({ label, encoding: "base64", value: value.toString("base64") });
    this.#needles.push({ label, encoding: "hex", value: value.toString("hex") });
    this.#needles.push({ label, encoding: "url-base64", value: encodeURIComponent(value.toString("base64")) });
  }

  scan(channel, value) {
    if (!this.#matches.has(channel)) throw new Error("Unknown leak scan channel");
    const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
    for (const needle of this.#needles) {
      if (needle.value.length >= 8 && text.includes(needle.value)) {
        this.#matches.get(channel).push({ label: needle.label, encoding: needle.encoding });
      }
    }
    if (containsSecretShape(text)) {
      this.#matches.get(channel).push({ label: "secret-shape", encoding: "pattern" });
    }
  }

  assertClean() {
    const matchCount = [...this.#matches.values()].reduce((total, matches) => total + matches.length, 0);
    if (matchCount !== 0) {
      const affectedChannels = [...this.#matches.entries()]
        .filter(([, matches]) => matches.length !== 0)
        .map(([channel]) => channel);
      throw new Error(`Sensitive leak scan failed in ${affectedChannels.join(",")}`);
    }
  }

  proveDetectors(canaryText) {
    const probes = Object.freeze({
      raw: canaryText,
      base64: Buffer.from(canaryText, "utf8").toString("base64"),
      url: encodeURIComponent(canaryText),
      hex: Buffer.from(canaryText, "utf8").toString("hex"),
    });
    for (const channel of leakChannels) {
      for (const [encoding, probe] of Object.entries(probes)) {
        const detected = this.#needles.some((needle) => needle.encoding === encoding
          && needle.value.length >= 8
          && probe.includes(needle.value));
        if (!detected) throw new Error(`Leak scanner negative probe failed for ${channel}/${encoding}`);
        this.#negativeProbeCount += 1;
      }
    }
  }

  summary() {
    const channels = Object.fromEntries([...this.#matches.entries()].map(([channel, matches]) => [
      channel,
      Object.freeze({ matchCount: matches.length }),
    ]));
    return Object.freeze({
      status: "PASS",
      channels,
      encodings: ["raw", "base64", "url", "hex", "secret-shape-pattern"],
      negativeProbeCount: this.#negativeProbeCount,
      matchCount: Object.values(channels).reduce((total, channel) => total + channel.matchCount, 0),
    });
  }
}

const leakScanner = new LeakScanner();
const runCanary = `r3-canary:${randomBytes(24).toString("base64")}/end`;
leakScanner.trackText("run-canary", runCanary);
leakScanner.proveDetectors(runCanary);
const activeHelperChildren = new Set();
const activeIpcChildren = new Set();

async function runKeychainSpike(directory) {
  const helper = join(directory, "robothree-keychain-spike");
  const keychainPath = join(directory, "spike.keychain-db");
  await execFile("xcrun", [
    "clang",
    "-fobjc-arc",
    "-Wno-deprecated-declarations",
    keychainHelperSource,
    "-framework",
    "Foundation",
    "-framework",
    "Security",
    "-o",
    helper,
  ], {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: join(directory, "clang-module-cache"),
      TMPDIR: directory,
    },
    maxBuffer: 1_048_576,
  });
  const keychainPassword = randomBytes(32);
  const service = `com.robothree.personal-model.spike.${randomUUID()}`;
  const account = randomUUID();
  const firstSecret = randomBytes(32);
  const secondSecret = randomBytes(32);
  leakScanner.trackBytes("keychain-first-secret", firstSecret);
  leakScanner.trackBytes("keychain-second-secret", secondSecret);
  let destroyed = false;
  try {
    await helperCommand(helper, {
      command: "create_test_keychain",
      keychainPath,
      keychainPasswordBase64: keychainPassword.toString("base64"),
    });
    await helperCommand(helper, {
      command: "store",
      keychainPath,
      service,
      account,
      secretBase64: firstSecret.toString("base64"),
    });
    assertSecret(await helperCommand(helper, {
      command: "resolve", keychainPath, service, account,
    }), firstSecret);
    await helperCommand(helper, {
      command: "replace",
      keychainPath,
      service,
      account,
      secretBase64: secondSecret.toString("base64"),
    });
    assertSecret(await helperCommand(helper, {
      command: "resolve", keychainPath, service, account,
    }), secondSecret);
    await helperCommand(helper, { command: "lock", keychainPath });
    const locked = await helperCommand(helper, {
      command: "resolve", keychainPath, service, account,
    }, false);
    if (locked.ok || locked.code !== "locked") {
      throw new Error(`Keychain locked state returned ${locked.code ?? "ok"}`);
    }
    await helperCommand(helper, {
      command: "unlock",
      keychainPath,
      keychainPasswordBase64: keychainPassword.toString("base64"),
    });
    assertSecret(await helperCommand(helper, {
      command: "resolve", keychainPath, service, account,
    }), secondSecret);
    await helperCommand(helper, { command: "delete", keychainPath, service, account });
    const missing = await helperCommand(helper, {
      command: "resolve", keychainPath, service, account,
    }, false);
    if (missing.ok || missing.code !== "not_found") {
      throw new Error("Deleted Keychain item remained resolvable");
    }
    const negativeMatrix = await runKeychainNegativeMatrix(helper, {
      directory,
      keychainPath,
      keychainPassword,
      service,
    });
    for (let index = 0; index < 5; index += 1) {
      const cycleAccount = randomUUID();
      const cycleSecret = randomBytes(32);
      leakScanner.trackBytes(`keychain-cycle-${index}`, cycleSecret);
      await helperCommand(helper, {
        command: "store",
        keychainPath,
        service,
        account: cycleAccount,
        secretBase64: cycleSecret.toString("base64"),
      });
      assertSecret(await helperCommand(helper, {
        command: "resolve", keychainPath, service, account: cycleAccount,
      }), cycleSecret);
      await helperCommand(helper, {
        command: "delete", keychainPath, service, account: cycleAccount,
      });
      cycleSecret.fill(0);
    }
    const modernSecItem = await runModernSecItemCanary(helper, keychainPath);
    await helperCommand(helper, { command: "destroy_test_keychain", keychainPath });
    destroyed = true;
    try {
      await stat(keychainPath);
      throw new Error("Temporary Keychain file remained after destroy");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return Object.freeze({
      status: "PASS",
      implementation: "signed_native_security_framework_helper",
      lifecycleCycleCount: 5,
      lockFailClosed: true,
      negativeMatrix,
      secretInArgvOrEnv: false,
      temporaryKeychainRemoved: true,
      modernSecItemTemporaryKeychain: modernSecItem,
      helperResourcesBounded: activeHelperChildren.size === 0,
    });
  } finally {
    keychainPassword.fill(0);
    firstSecret.fill(0);
    secondSecret.fill(0);
    if (!destroyed) {
      await helperCommand(helper, { command: "destroy_test_keychain", keychainPath }, false)
        .catch(() => undefined);
    }
  }
}

async function runKeychainNegativeMatrix(helper, {
  directory,
  keychainPath,
  keychainPassword,
  service,
}) {
  await helperCommand(helper, { command: "lock", keychainPath });
  const wrongPassword = randomBytes(32);
  try {
    const accessDenied = await helperCommand(helper, {
      command: "unlock",
      keychainPath,
      keychainPasswordBase64: wrongPassword.toString("base64"),
    }, false);
    if (accessDenied.ok || accessDenied.code !== "access_denied") {
      throw new Error(`Expected access_denied, got ${accessDenied.code ?? "ok"}`);
    }
  } finally {
    wrongPassword.fill(0);
    await helperCommand(helper, {
      command: "unlock",
      keychainPath,
      keychainPasswordBase64: keychainPassword.toString("base64"),
    });
  }

  const corruptedPath = join(directory, "corrupted.keychain-db");
  await writeFile(corruptedPath, randomBytes(128), { mode: 0o600 });
  const corrupted = await helperCommand(helper, {
    command: "probe_corrupted",
    keychainPath: corruptedPath,
  }, false);
  if (corrupted.ok || corrupted.code !== "corrupted") {
    throw new Error(`Expected corrupted, got ${corrupted.code ?? "ok"}`);
  }

  const cancelAccount = randomUUID();
  const cancelSecret = randomBytes(32);
  leakScanner.trackBytes("keychain-cancel-secret", cancelSecret);
  const cancelled = await controlledStoreCommand(helper, {
    command: "controlled_store",
    failpoint: "before_mutation",
    keychainPath,
    service,
    account: cancelAccount,
    secretBase64: cancelSecret.toString("base64"),
  }, "SIGTERM");
  cancelSecret.fill(0);
  if (cancelled.code !== "cancelled") throw new Error("Broker cancellation did not converge");
  const cancelledMissing = await helperCommand(helper, {
    command: "resolve", keychainPath, service, account: cancelAccount,
  }, false);
  if (cancelledMissing.ok || cancelledMissing.code !== "not_found") {
    throw new Error("Cancelled Keychain mutation created an item");
  }

  let beforeMutationCrashCount = 0;
  let afterMutationCrashCount = 0;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const beforeAccount = randomUUID();
    const beforeSecret = randomBytes(32);
    leakScanner.trackBytes(`keychain-before-crash-${cycle}`, beforeSecret);
    const beforeCrash = await controlledStoreCommand(helper, {
      command: "controlled_store",
      failpoint: "before_mutation",
      keychainPath,
      service,
      account: beforeAccount,
      secretBase64: beforeSecret.toString("base64"),
    }, "SIGKILL");
    beforeSecret.fill(0);
    if (beforeCrash.code !== "process_terminated") throw new Error("Before-mutation crash was not observed");
    const beforeMissing = await helperCommand(helper, {
      command: "resolve", keychainPath, service, account: beforeAccount,
    }, false);
    if (beforeMissing.ok || beforeMissing.code !== "not_found") {
      throw new Error("Before-mutation crash created an item");
    }
    beforeMutationCrashCount += 1;

    const afterAccount = randomUUID();
    const afterSecret = randomBytes(32);
    leakScanner.trackBytes(`keychain-after-crash-${cycle}`, afterSecret);
    const expectedAfterSecret = Buffer.from(afterSecret);
    const afterCrash = await controlledStoreCommand(helper, {
      command: "controlled_store",
      failpoint: "after_mutation_before_response",
      keychainPath,
      service,
      account: afterAccount,
      secretBase64: afterSecret.toString("base64"),
    }, "SIGKILL");
    afterSecret.fill(0);
    if (afterCrash.code !== "process_terminated") throw new Error("After-mutation crash was not observed");
    assertSecret(await helperCommand(helper, {
      command: "resolve", keychainPath, service, account: afterAccount,
    }), expectedAfterSecret);
    expectedAfterSecret.fill(0);
    await helperCommand(helper, {
      command: "delete", keychainPath, service, account: afterAccount,
    });
    afterMutationCrashCount += 1;
  }

  const duplicateAccount = randomUUID();
  const duplicateSecret = randomBytes(32);
  leakScanner.trackBytes("keychain-duplicate-secret", duplicateSecret);
  await helperCommand(helper, {
    command: "store",
    keychainPath,
    service,
    account: duplicateAccount,
    secretBase64: duplicateSecret.toString("base64"),
  });
  const duplicate = await helperCommand(helper, {
    command: "store",
    keychainPath,
    service,
    account: duplicateAccount,
    secretBase64: duplicateSecret.toString("base64"),
  }, false);
  duplicateSecret.fill(0);
  if (duplicate.ok || duplicate.code !== "conflict") throw new Error("Duplicate store did not conflict");
  await helperCommand(helper, {
    command: "delete", keychainPath, service, account: duplicateAccount,
  });

  return Object.freeze({
    status: "PASS",
    accessDeniedTriggered: true,
    cancelledTriggered: true,
    cancelledItemCount: 0,
    corruptedTriggered: true,
    abnormalExitRecovery: true,
    beforeMutationCrashCount,
    afterMutationCrashCount,
    duplicateConflictTriggered: true,
    helperResourcesBounded: activeHelperChildren.size === 0,
  });
}

async function runModernSecItemCanary(helper, keychainPath) {
  const service = `com.robothree.personal-model.secitem-spike.${randomUUID()}`;
  const account = randomUUID();
  const firstSecret = randomBytes(32);
  const secondSecret = randomBytes(32);
  leakScanner.trackBytes("modern-secitem-first", firstSecret);
  leakScanner.trackBytes("modern-secitem-second", secondSecret);
  await helperCommand(helper, {
    command: "secitem_store",
    keychainPath,
    service,
    account,
    secretBase64: firstSecret.toString("base64"),
  });
  assertSecret(await helperCommand(helper, {
    command: "secitem_resolve", keychainPath, service, account,
  }), firstSecret);
  await helperCommand(helper, {
    command: "secitem_replace",
    keychainPath,
    service,
    account,
    secretBase64: secondSecret.toString("base64"),
  });
  assertSecret(await helperCommand(helper, {
    command: "secitem_resolve", keychainPath, service, account,
  }), secondSecret);
  await helperCommand(helper, {
    command: "secitem_delete", keychainPath, service, account,
  });
  const missing = await helperCommand(helper, {
    command: "secitem_resolve",
    keychainPath,
    service,
    account,
  }, false);
  if (missing.ok || missing.code !== "not_found") {
    throw new Error(`Unexpected temporary SecItem probe result: ${missing.code ?? "ok"}`);
  }
  firstSecret.fill(0);
  secondSecret.fill(0);
  return Object.freeze({
    status: "PASS",
    keychain: "temporary",
    defaultKeychainTouched: false,
    lifecycle: ["store", "resolve", "replace", "resolve", "delete", "not_found"],
  });
}

async function helperCommand(helper, input, requireSuccess = true, options = {}) {
  const request = Buffer.from(JSON.stringify({ protocolVersion: 1, ...input }));
  const child = spawn(helper, [], {
    env: {},
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeHelperChildren.add(child);
  child.once("error", () => activeHelperChildren.delete(child));
  let timedOut = false;
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.end(request);
  request.fill(0);
  const code = await new Promise((resolve, reject) => {
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      if (timeout !== undefined) clearTimeout(timeout);
      activeHelperChildren.delete(child);
      resolve(exitCode);
    });
  });
  const stderrText = Buffer.concat(stderr).toString("utf8");
  leakScanner.scan("diagnostic_stderr", stderrText);
  if (stderrText.trim() !== "") throw new Error("Keychain helper wrote to stderr");
  if (timedOut) throw new Error("Keychain helper timed out");
  const stdoutText = Buffer.concat(stdout).toString("utf8");
  if (options.scanStdout === true) leakScanner.scan("diagnostic_stderr", stdoutText);
  if (options.allowNoJson === true && stdoutText.trim() === "") {
    return Object.freeze({ ok: false, code: undefined, exitCode: code });
  }
  const response = JSON.parse(stdoutText);
  if (requireSuccess && (code !== 0 || response.ok !== true)) {
    throw new Error(`Keychain helper failed with ${response.code ?? "unknown"}`);
  }
  return response;
}

async function controlledStoreCommand(helper, input, signal) {
  const request = Buffer.from(JSON.stringify({ protocolVersion: 1, ...input }));
  const child = spawn(helper, [], {
    env: {},
    stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
  });
  activeHelperChildren.add(child);
  child.once("error", () => activeHelperChildren.delete(child));
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.end(request);
  request.fill(0);
  try {
    await waitForBarrier(child.stdio[3], 2_000);
    const exitPromise = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, exitSignal) => resolve({ code, signal: exitSignal }));
    });
    if (!child.kill(signal)) throw new Error("Controlled Keychain process could not be terminated");
    const exit = await exitPromise;
    const stderrText = Buffer.concat(stderr).toString("utf8");
    const stdoutText = Buffer.concat(stdout).toString("utf8");
    leakScanner.scan("diagnostic_stderr", stderrText);
    leakScanner.scan("diagnostic_stderr", stdoutText);
    if (stderrText.trim() !== "" || stdoutText.trim() !== "") {
      throw new Error("Controlled Keychain process emitted diagnostics");
    }
    if (exit.signal !== signal) throw new Error("Controlled Keychain process exited unexpectedly");
    return Object.freeze({
      ok: false,
      code: signal === "SIGTERM" ? "cancelled" : "process_terminated",
    });
  } finally {
    activeHelperChildren.delete(child);
    child.stdio[4]?.destroy();
  }
}

function waitForBarrier(stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Controlled Keychain barrier timed out"));
    }, timeoutMs);
    const onData = (chunk) => {
      if (!Buffer.from(chunk).includes(0x31)) return;
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("Controlled Keychain process exited before barrier"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("end", onEnd);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
  });
}

function assertSecret(response, expected) {
  const actual = Buffer.from(response.secretBase64 ?? "", "base64");
  try {
    if (!actual.equals(expected)) throw new Error("Keychain resolve mismatch");
  } finally {
    actual.fill(0);
  }
}

async function runChildIpcSpike() {
  let completedCount = 0;
  let cancelledCount = 0;
  let deadlineCount = 0;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const child = fork(ipcFixture, [], {
      env: { NODE_ENV: "test" },
      execArgv: [],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    activeIpcChildren.add(child);
    const stderr = [];
    const resultCounts = new Map();
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("message", (message) => {
      if (message?.type !== "dfi4a.credential.result") return;
      resultCounts.set(message.commandId, (resultCounts.get(message.commandId) ?? 0) + 1);
    });
    try {
      const secret = randomBytes(32);
      leakScanner.trackBytes(`ipc-completion-${cycle}`, secret);
      const expectedSecret = Buffer.from(secret);
      const expectedDigest = createHash("sha256").update(expectedSecret).digest("hex");
      const commandId = randomUUID();
      const resultPromise = waitForIpcResult(child, commandId, 2_000);
      child.send({
        protocolVersion: 1,
        type: "dfi4a.credential.request",
        commandId,
        deadlineAt: Date.now() + 1_000,
        holdMs: 0,
        secret,
      }, () => secret.fill(0));
      const result = await resultPromise;
      const returned = Buffer.from(result.secret);
      try {
        if (!returned.equals(expectedSecret) || result.digest !== expectedDigest) {
          throw new Error("Sensitive IPC roundtrip changed the credential bytes");
        }
      } finally {
        expectedSecret.fill(0);
        returned.fill(0);
      }
      completedCount += 1;

      const cancelId = randomUUID();
      const cancelSecret = randomBytes(32);
      leakScanner.trackBytes(`ipc-cancel-${cycle}`, cancelSecret);
      const cancelResult = waitForIpcResult(child, cancelId, 2_000);
      child.send({
        protocolVersion: 1,
        type: "dfi4a.credential.request",
        commandId: cancelId,
        deadlineAt: Date.now() + 1_000,
        holdMs: 500,
        secret: cancelSecret,
      }, () => cancelSecret.fill(0));
      child.send({
        protocolVersion: 1,
        type: "dfi4a.credential.cancel",
        commandId: cancelId,
      });
      if ((await cancelResult).code !== "cancelled") {
        throw new Error("Sensitive IPC cancel did not converge");
      }
      await delay(550);
      if (resultCounts.get(cancelId) !== 1) throw new Error("Sensitive IPC cancel produced a late result");
      cancelledCount += 1;

      const deadlineId = randomUUID();
      const deadlineSecret = randomBytes(32);
      leakScanner.trackBytes(`ipc-deadline-${cycle}`, deadlineSecret);
      const deadlineResult = waitForIpcResult(child, deadlineId, 2_000);
      child.send({
        protocolVersion: 1,
        type: "dfi4a.credential.request",
        commandId: deadlineId,
        deadlineAt: Date.now() - 1,
        holdMs: 0,
        secret: deadlineSecret,
      }, () => deadlineSecret.fill(0));
      if ((await deadlineResult).code !== "deadline_exceeded") {
        throw new Error("Sensitive IPC deadline did not fail closed");
      }
      deadlineCount += 1;

      if (cycle === 0) {
        const malformed = waitForIpcResult(child, "invalid", 2_000);
        child.send({ protocolVersion: 1, type: "dfi4a.credential.request", unexpected: true });
        if ((await malformed).code !== "invalid_request") {
          throw new Error("Sensitive IPC malformed request did not fail closed");
        }

        const duplicateId = randomUUID();
        const duplicateSecret = randomBytes(32);
        const duplicateCopy = Buffer.from(duplicateSecret);
        leakScanner.trackBytes("ipc-duplicate", duplicateSecret);
        const duplicateResults = waitForIpcResults(child, duplicateId, 2, 2_000);
        child.send({
          protocolVersion: 1,
          type: "dfi4a.credential.request",
          commandId: duplicateId,
          deadlineAt: Date.now() + 1_000,
          holdMs: 100,
          secret: duplicateSecret,
        }, () => duplicateSecret.fill(0));
        child.send({
          protocolVersion: 1,
          type: "dfi4a.credential.request",
          commandId: duplicateId,
          deadlineAt: Date.now() + 1_000,
          holdMs: 100,
          secret: duplicateCopy,
        }, () => duplicateCopy.fill(0));
        const duplicateOutcomes = await duplicateResults;
        if (!duplicateOutcomes.some((outcome) => outcome.code === "conflict")
          || !duplicateOutcomes.some((outcome) => outcome.code === "roundtrip")) {
          throw new Error("Sensitive IPC duplicate request did not preserve the original operation");
        }
        for (const outcome of duplicateOutcomes) {
          if (Buffer.isBuffer(outcome.secret)) outcome.secret.fill(0);
        }

        const wrongCommandId = randomUUID();
        child.send({
          protocolVersion: 1,
          type: "dfi4a.credential.cancel",
          commandId: wrongCommandId,
        });
        await expectNoIpcResult(child, wrongCommandId, 150);
      }
    } finally {
      if (child.connected) child.disconnect();
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve) => child.once("exit", resolve));
      }
      activeIpcChildren.delete(child);
    }
    if (Buffer.concat(stderr).length !== 0) {
      leakScanner.scan("diagnostic_stderr", Buffer.concat(stderr));
      throw new Error("Sensitive IPC fixture wrote to stderr");
    }
  }
  const restartIsolation = await proveIpcRestartIsolation();
  const productionSupervisorCompatibility = await runProductionSupervisorIpcCompatibilitySpike();
  return Object.freeze({
    status: "PASS",
    advancedFixtureStatus: "PASS",
    selectedChannel: "not_selected_in_dfi4a0_repair1",
    advancedFixtureSerialization: "advanced_buffer",
    productionSupervisorCompatibility,
    decision: "existing_json_supervisor_ipc_is_not_sufficient_for_sensitive_buffer_payloads",
    requiredFollowUp: "DFI-4A.1+ must add a dedicated sensitive channel or explicitly change supervisor serialization with boot/shutdown regression coverage",
    advancedFixtureLifecycleCycleCount: 5,
    completedCount,
    cancelledCount,
    deadlineCount,
    restartIsolation,
    resourcesBounded: activeIpcChildren.size === 0,
    secretInArgvOrEnv: false,
  });
}

async function runProductionSupervisorIpcCompatibilitySpike() {
  const supervisorSource = await readFile(corePrivateSupervisorSource, "utf8");
  const usesJsonSerialization = /serialization:\s*"json"/u.test(supervisorSource);
  if (!usesJsonSerialization) {
    throw new Error("Expected current CorePrivateSupervisor to use json serialization");
  }
  const child = fork(ipcFixture, [], {
    env: { NODE_ENV: "test" },
    execArgv: [],
    serialization: "json",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  let compatibilityResult;
  try {
    const commandId = randomUUID();
    const secret = randomBytes(32);
    leakScanner.trackBytes("ipc-json-supervisor-probe", secret);
    const resultPromise = waitForIpcResult(child, "invalid", 2_000);
    child.send({
      protocolVersion: 1,
      type: "dfi4a.credential.request",
      commandId,
      deadlineAt: Date.now() + 1_000,
      holdMs: 0,
      secret,
    }, () => secret.fill(0));
    const result = await resultPromise;
    if (result.code !== "invalid_request") {
      throw new Error(`Expected json supervisor probe to reject Buffer payload, got ${result.code ?? "unknown"}`);
    }

    child.send({ type: "desktop.core.shutdown" });
    const shutdownResult = await waitForIpcResult(child, "invalid", 2_000);
    if (shutdownResult.code !== "invalid_request") {
      throw new Error("Boot/shutdown discriminator coexistence probe did not remain isolated");
    }

    compatibilityResult = Object.freeze({
      status: "PASS",
      productionSerialization: "json",
      sensitiveBufferPreserved: false,
      bootShutdownDiscriminatorCoexists: true,
      conclusion: "requires_dedicated_sensitive_channel_or_supervisor_serialization_change",
    });
  } finally {
    if (child.connected) child.disconnect();
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => child.once("exit", resolve));
    }
    leakScanner.scan("diagnostic_stderr", Buffer.concat(stderr));
  }
  if (Buffer.concat(stderr).length !== 0) {
    throw new Error("Production supervisor compatibility fixture wrote to stderr");
  }
  return compatibilityResult;
}

async function proveIpcRestartIsolation() {
  const oldChild = fork(ipcFixture, [], {
    env: { NODE_ENV: "test" },
    execArgv: [],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  activeIpcChildren.add(oldChild);
  const oldSecret = randomBytes(32);
  leakScanner.trackBytes("ipc-restart-old", oldSecret);
  oldChild.send({
    protocolVersion: 1,
    type: "dfi4a.credential.request",
    commandId: randomUUID(),
    deadlineAt: Date.now() + 2_000,
    holdMs: 1_000,
    secret: oldSecret,
  }, () => oldSecret.fill(0));
  const oldExit = new Promise((resolve) => oldChild.once("exit", resolve));
  oldChild.kill("SIGKILL");
  await oldExit;
  activeIpcChildren.delete(oldChild);

  const newChild = fork(ipcFixture, [], {
    env: { NODE_ENV: "test" },
    execArgv: [],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  activeIpcChildren.add(newChild);
  const newSecret = randomBytes(32);
  const expectedNew = Buffer.from(newSecret);
  leakScanner.trackBytes("ipc-restart-new", newSecret);
  const newCommandId = randomUUID();
  try {
    const resultPromise = waitForIpcResult(newChild, newCommandId, 2_000);
    newChild.send({
      protocolVersion: 1,
      type: "dfi4a.credential.request",
      commandId: newCommandId,
      deadlineAt: Date.now() + 1_000,
      holdMs: 0,
      secret: newSecret,
    }, () => newSecret.fill(0));
    const result = await resultPromise;
    const actual = Buffer.from(result.secret);
    try {
      if (!actual.equals(expectedNew)) throw new Error("Restarted IPC child returned stale bytes");
    } finally {
      actual.fill(0);
      expectedNew.fill(0);
    }
  } finally {
    if (newChild.connected) newChild.disconnect();
    if (newChild.exitCode === null && newChild.signalCode === null) newChild.kill("SIGTERM");
    if (newChild.exitCode === null && newChild.signalCode === null) {
      await new Promise((resolve) => newChild.once("exit", resolve));
    }
    activeIpcChildren.delete(newChild);
  }
  return Object.freeze({ status: "PASS", staleResultCount: 0 });
}

function waitForIpcResult(child, commandId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Sensitive IPC result timed out"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type === "dfi4a.credential.result" && message.commandId === commandId) {
        cleanup();
        resolve(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
    };
    child.on("message", onMessage);
  });
}

function waitForIpcResults(child, commandId, count, timeoutMs) {
  return new Promise((resolve, reject) => {
    const results = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Sensitive IPC results timed out"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type !== "dfi4a.credential.result" || message.commandId !== commandId) return;
      results.push(message);
      if (results.length === count) {
        cleanup();
        resolve(results);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
    };
    child.on("message", onMessage);
  });
}

function expectNoIpcResult(child, commandId, durationMs) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message?.type === "dfi4a.credential.result" && message.commandId === commandId) {
        cleanup();
        reject(new Error("Unknown IPC command produced a result"));
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
    };
    child.on("message", onMessage);
  });
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function runEndpointTransportSpike() {
  const accepted = await resolveAndPin("https://api.example.test/v1", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  if (accepted.address !== "93.184.216.34") throw new Error("Public DNS result was not pinned");
  for (const endpoint of [
    "http://api.example.test/v1",
    "https://user@example.test/v1",
    "https://api.example.test/v1?secret=value",
    "https://api.example.test/v1#fragment",
  ]) {
    await expectRejected(() => resolveAndPin(endpoint, async () => [
      { address: "93.184.216.34", family: 4 },
    ]));
  }
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fe80::1", "fc00::1"] ) {
    await expectRejected(() => resolveAndPin("https://api.example.test/v1", async () => [
      { address, family: address.includes(":") ? 6 : 4 },
    ]));
  }
  await expectRejected(() => resolveAndPin("https://api.example.test/v1", async () => [
    { address: "::ffff:127.0.0.1", family: 6 },
  ]));
  await expectRejected(() => resolveAndPin("https://api.example.test/v1", async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]));

  const loopback = await provePinnedLookupOnTestLoopback();
  if (!loopback.pinned || !loopback.redirectNotFollowed || !loopback.tlsSniPreserved
    || !loopback.hostHeaderPreserved || !loopback.remoteAddressRechecked
    || !loopback.wrongCertificateRejected || !loopback.wrongHostnameRejected) {
    throw new Error("HTTPS pinned loopback proof did not satisfy all transport invariants");
  }
  return Object.freeze({
    status: "PASS",
    selectedTransport: "node_https_request_with_validated_pinned_lookup",
    thirdPartyDependencyRequired: false,
    redirectPolicy: "manual_reject",
    mixedDnsAnswerPolicy: "reject_all",
    testLoopbackPinned: loopback.pinned,
    redirectNotFollowed: loopback.redirectNotFollowed,
    tlsSniPreserved: loopback.tlsSniPreserved,
    hostHeaderPreserved: loopback.hostHeaderPreserved,
    remoteAddressRechecked: loopback.remoteAddressRechecked,
    wrongCertificateRejected: loopback.wrongCertificateRejected,
    wrongHostnameRejected: loopback.wrongHostnameRejected,
  });
}

async function resolveAndPin(rawEndpoint, resolver) {
  const endpoint = new URL(rawEndpoint);
  if (endpoint.protocol !== "https:") throw new Error("endpoint_rejected");
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("endpoint_rejected");
  }
  const answers = await resolver(endpoint.hostname);
  if (answers.length === 0 || answers.some(({ address, family }) => isDeniedAddress(address, family))) {
    throw new Error("endpoint_rejected");
  }
  const [{ address, family }] = answers;
  return Object.freeze({
    endpoint,
    address,
    family,
    lookup: (_hostname, options, callback) => {
      if (options?.all === true) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    },
  });
}

const denyList = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) denyList.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96],
  ["64:ff9b:1::", 48], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) denyList.addSubnet(network, prefix, "ipv6");

function isDeniedAddress(address, family) {
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return true;
  return denyList.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function provePinnedLookupOnTestLoopback() {
  let requestCount = 0;
  const tlsDirectory = await mkdtemp(join(tmpdir(), "robothree-dfi4a0-tls-"));
  const caKeyPath = join(tlsDirectory, "ca.key");
  const caCertPath = join(tlsDirectory, "ca.crt");
  const keyPath = join(tlsDirectory, "server.key");
  const csrPath = join(tlsDirectory, "server.csr");
  const certPath = join(tlsDirectory, "server.crt");
  const extensionPath = join(tlsDirectory, "server.ext");
  await execFile("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "1",
    "-subj",
    "/CN=RoboThree DFI4A0 Test CA",
    "-keyout",
    caKeyPath,
    "-out",
    caCertPath,
  ], { env: { ...process.env, TMPDIR: tlsDirectory }, maxBuffer: 1_048_576 });
  await execFile("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-subj",
    "/CN=spike.invalid",
    "-keyout",
    keyPath,
    "-out",
    csrPath,
  ], { env: { ...process.env, TMPDIR: tlsDirectory }, maxBuffer: 1_048_576 });
  await writeFile(extensionPath, "subjectAltName=DNS:spike.invalid\nextendedKeyUsage=serverAuth\n", { mode: 0o600 });
  await execFile("openssl", [
    "x509",
    "-req",
    "-in",
    csrPath,
    "-CA",
    caCertPath,
    "-CAkey",
    caKeyPath,
    "-CAcreateserial",
    "-days",
    "1",
    "-sha256",
    "-extfile",
    extensionPath,
    "-out",
    certPath,
  ], { env: { ...process.env, TMPDIR: tlsDirectory }, maxBuffer: 1_048_576 });
  const [key, cert, ca] = await Promise.all([
    readFile(keyPath),
    readFile(certPath),
    readFile(caCertPath),
  ]);
  const observedSni = new Set();
  const observedHosts = new Set();
  const server = createHttpsServer({ key, cert }, (request, response) => {
    requestCount += 1;
    observedHosts.add(request.headers.host ?? "");
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "https://127.0.0.1/forbidden-target" });
      response.end();
      return;
    }
    response.writeHead(request.headers.host === "spike.invalid" ? 204 : 400);
    response.end();
  });
  server.on("secureConnection", (socket) => {
    observedSni.add(socket.servername ?? "");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    if (typeof address === "string" || address === null) throw new Error("loopback fixture unavailable");
    const requestPinned = (path, overrides = {}) => new Promise((resolve, reject) => {
      let connectedRemoteAddress = "";
      const request = httpsRequest({
        host: "spike.invalid",
        port: address.port,
        path,
        method: "GET",
        ca,
        servername: "spike.invalid",
        headers: { host: "spike.invalid" },
        lookup: (_hostname, options, callback) => {
          if (options?.all === true) {
            callback(null, [{ address: "127.0.0.1", family: 4 }]);
            return;
          }
          callback(null, "127.0.0.1", 4);
        },
        ...overrides,
      }, (response) => {
        connectedRemoteAddress = response.socket.remoteAddress ?? "";
        response.resume();
        response.once("end", () => resolve({
          statusCode: response.statusCode,
          remoteAddress: connectedRemoteAddress,
        }));
      });
      request.once("error", reject);
      request.end();
    });
    const status = await requestPinned("/");
    const redirectStatus = await requestPinned("/redirect");
    const wrongCertificateRejected = await expectTlsRejected(() => requestPinned("/", { ca: undefined }));
    const wrongHostnameRejected = await expectTlsRejected(() => requestPinned("/", {
      servername: "wrong.invalid",
    }));
    return Object.freeze({
      pinned: status.statusCode === 204,
      redirectNotFollowed: redirectStatus.statusCode === 302 && requestCount === 2,
      tlsSniPreserved: observedSni.has("spike.invalid"),
      hostHeaderPreserved: observedHosts.has("spike.invalid"),
      remoteAddressRechecked: status.remoteAddress === "127.0.0.1"
        && redirectStatus.remoteAddress === "127.0.0.1",
      wrongCertificateRejected,
      wrongHostnameRejected,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(tlsDirectory, { recursive: true, force: true });
  }
}

async function expectTlsRejected(operation) {
  try {
    await operation();
  } catch {
    return true;
  }
  return false;
}

async function expectRejected(operation) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error("Expected endpoint to be rejected");
}

function containsSecretShape(value) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|credentialReference\s*[:=])/u.test(value);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "robothree-dfi4a0-"));
try {
  evidence.keychain = await runKeychainSpike(temporaryDirectory);
  evidence.childIpc = await runChildIpcSpike();
  evidence.endpointTransport = await runEndpointTransportSpike();
  const traceCapture = JSON.stringify({
    keychain: evidence.keychain.status,
    childIpc: evidence.childIpc.status,
    endpointTransport: evidence.endpointTransport.status,
  });
  leakScanner.scan("test_trace", traceCapture);
  const evidenceDraft = JSON.stringify(evidence);
  leakScanner.scan("evidence_json", evidenceDraft);
  leakScanner.scan("parent_stdout", evidenceDraft);
  leakScanner.assertClean();
  evidence.leakScan = leakScanner.summary();
  const serialized = JSON.stringify(evidence);
  leakScanner.scan("evidence_json", serialized);
  leakScanner.scan("parent_stdout", serialized);
  leakScanner.assertClean();
  evidence.leakScan = leakScanner.summary();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  leakScanner.scan("diagnostic_stderr", error?.stack ?? error?.message ?? error);
  leakScanner.assertClean();
  throw error;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
