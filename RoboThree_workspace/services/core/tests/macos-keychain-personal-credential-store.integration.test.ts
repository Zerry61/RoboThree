import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  FixedPersonalCredentialReferenceUsage,
  FixedPersonalModelDeletionGuard,
  FixedPersonalModelOwnerAuthorityContextProvider,
  InMemoryPersonalModelPersistence,
  InMemoryPersonalModelOperationGate,
  MacOsKeychainPersonalCredentialStore,
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialRevealService,
  PersonalModelRevealAttemptRegistry,
  allocatePersonalCredentialReference,
  createPersonalModelCredentialCommand,
  createPersonalModelRevealCommand,
  derivePersonalModelOwnerIdentity,
  mapPersonalCredentialHelperErrorCode,
  verifyPersonalCredentialHelperDescriptor,
} from "../src/index.js";

const execFile = promisify(execFileCallback);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe.runIf(process.platform === "darwin")("DFI-4A.2.1 macOS Keychain adapter", () => {
  it("maps every bounded helper failure without exposing OSStatus", () => {
    expect([
      "unavailable", "locked", "not_found", "access_denied", "corrupted",
      "cancelled", "conflict", "input_already_bound", "uncertain", "internal",
    ].map((code) => mapPersonalCredentialHelperErrorCode(code as never))).toEqual([
      "credential_store_unavailable",
      "credential_store_locked",
      "credential_store_not_found",
      "credential_store_access_denied",
      "credential_store_corrupted",
      "credential_store_cancelled",
      "credential_store_conflict",
      "credential_input_already_bound",
      "credential_operation_uncertain",
      "credential_store_internal",
    ]);
  });

  it("runs isolated store/replay/replace/inspect/resolve/delete conformance", async () => {
    const fixture = await createFixture();
    const store = new MacOsKeychainPersonalCredentialStore({ descriptor: fixture.descriptor });
    const firstRef = allocatePersonalCredentialReference();
    const secondRef = allocatePersonalCredentialReference();
    const firstOperation = randomUUID();
    const secondOperation = randomUUID();
    const firstSecret = randomBytes(48);
    const secondSecret = randomBytes(49);
    try {
      await store.start();
      expect(store.productionReady).toBe(false);
      const replay = await store.store(firstOperation, firstRef, firstSecret);
      if (!replay.ok) throw new Error(replay.error.code);
      expect(replay).toMatchObject({
        ok: true,
        replayed: false,
        value: { state: "present", credentialRef: firstRef, credentialRevision: 1 },
      });
      const exactReplay = await store.store(firstOperation, firstRef, firstSecret);
      if (!exactReplay.ok) throw new Error(exactReplay.error.code);
      expect(exactReplay).toMatchObject({
        ok: true,
        replayed: true,
      });
      const conflicting = Uint8Array.from(firstSecret);
      conflicting[0] ^= 0xff;
      expect(await store.store(firstOperation, firstRef, conflicting)).toMatchObject({
        ok: false,
        error: { code: "credential_input_already_bound" },
      });
      conflicting.fill(0);

      const resolvedFirst = await store.resolve(firstRef);
      expect(resolvedFirst).toMatchObject({ ok: true });
      if (resolvedFirst.ok) {
        expect([...resolvedFirst.value]).toEqual([...firstSecret]);
        resolvedFirst.value.fill(0);
      }
      await fixture.lock();
      expect(await store.resolve(firstRef)).toMatchObject({
        ok: false,
        error: { code: "credential_store_locked" },
      });
      await fixture.unlock();
      expect(await store.replace(secondOperation, firstRef, secondRef, secondSecret)).toMatchObject({
        ok: true,
        value: { state: "present", credentialRef: secondRef, credentialRevision: 2 },
      });
      expect(await store.inspect(firstRef)).toMatchObject({ state: "present" });
      expect(await store.inspect(secondRef)).toMatchObject({ state: "present", credentialRevision: 2 });
      expect(await store.delete(randomUUID(), secondRef)).toMatchObject({ ok: true, replayed: false });
      expect(await store.delete(randomUUID(), secondRef)).toMatchObject({ ok: true, replayed: true });
      expect(await store.inspect(secondRef)).toEqual({ state: "absent", credentialRef: secondRef });
    } finally {
      firstSecret.fill(0);
      secondSecret.fill(0);
      await store.stop();
      await fixture.destroy();
    }
  }, 30_000);

  it("fails closed without a verified descriptor and rejects tampered helper metadata", async () => {
    const unavailable = new MacOsKeychainPersonalCredentialStore();
    await unavailable.start();
    const ref = allocatePersonalCredentialReference();
    expect(await unavailable.inspect(ref)).toMatchObject({
      state: "unavailable",
      errorCode: "credential_store_unavailable",
    });
    await unavailable.stop();

    const fixture = await createFixture();
    try {
      expect(await verifyPersonalCredentialHelperDescriptor({
        ...fixture.descriptor,
        manifestSha256: `sha256:${"0".repeat(64)}`,
      })).toBeUndefined();
      expect(await verifyPersonalCredentialHelperDescriptor({
        ...fixture.descriptor,
        protocolVersion: "personal-keychain-helper.v0" as never,
      })).toBeUndefined();
      const linkPath = join(fixture.directory, "Resources", "helper-link");
      await symlink(fixture.descriptor.helperPath, linkPath);
      expect(await verifyPersonalCredentialHelperDescriptor({
        ...fixture.descriptor,
        helperPath: linkPath,
      })).toBeUndefined();
      await chmod(fixture.descriptor.helperPath, 0o775);
      expect(await verifyPersonalCredentialHelperDescriptor(fixture.descriptor)).toBeUndefined();
      await chmod(fixture.descriptor.helperPath, 0o755);
      expect(await verifyPersonalCredentialHelperDescriptor({
        ...fixture.descriptor,
        activation: "production_verified",
        designatedRequirement: "anchor apple generic",
        teamIdentifier: "TEAMTEST",
      }, { verifyProductionSignature: async () => false })).toBeUndefined();
    } finally {
      await fixture.destroy();
    }
  }, 30_000);

  it("closes ten one-shot helper lifecycles without retaining credential bytes", async () => {
    const fixture = await createFixture();
    const store = new MacOsKeychainPersonalCredentialStore({ descriptor: fixture.descriptor });
    await store.start();
    try {
      for (let index = 0; index < 10; index += 1) {
        const ref = allocatePersonalCredentialReference();
        const secret = randomBytes(32 + index);
        const operationId = randomUUID();
        expect((await store.store(operationId, ref, secret)).ok).toBe(true);
        secret.fill(0);
        expect((await store.delete(randomUUID(), ref)).ok).toBe(true);
      }
    } finally {
      await store.stop();
      await fixture.destroy();
    }
  }, 30_000);

  it("reconciles before/after-mutation helper exits through inspect", async () => {
    const fixture = await createFixture();
    try {
      const beforeDescriptor = await createCrashWrapper(fixture, "before_mutation");
      const before = new MacOsKeychainPersonalCredentialStore({ descriptor: beforeDescriptor });
      await before.start();
      const beforeSecret = randomBytes(32);
      expect(await before.store(randomUUID(), allocatePersonalCredentialReference(), beforeSecret))
        .toMatchObject({
          ok: false,
          error: { code: "credential_operation_uncertain" },
        });
      beforeSecret.fill(0);
      await before.stop();

      const afterDescriptor = await createCrashWrapper(fixture, "after_mutation");
      const after = new MacOsKeychainPersonalCredentialStore({ descriptor: afterDescriptor });
      await after.start();
      const afterSecret = randomBytes(32);
      expect(await after.store(randomUUID(), allocatePersonalCredentialReference(), afterSecret))
        .toMatchObject({ ok: true, replayed: true, value: { state: "present" } });
      afterSecret.fill(0);
      await after.stop();
    } finally {
      await fixture.destroy();
    }
  }, 30_000);

  it("commits a prepared Personal Model through the real isolated Keychain adapter", async () => {
    const fixture = await createFixture();
    const store = new MacOsKeychainPersonalCredentialStore({ descriptor: fixture.descriptor });
    const persistence = new InMemoryPersonalModelPersistence();
    const clock = new FakeClock("2026-08-21T09:00:00.000Z");
    const authorityContext = {
      enterpriseId: "enterprise.keychain-test",
      userId: "user.keychain-test",
      deviceId: "device.keychain-test",
      entitlementGranted: true,
      entitlementRevision: `sha256:${"e".repeat(64)}` as const,
      offlineState: "online" as const,
    };
    const authorityContexts = new FixedPersonalModelOwnerAuthorityContextProvider(authorityContext);
    const operationGate = new InMemoryPersonalModelOperationGate();
    const coordinator = new PersonalModelCredentialCoordinator({
      persistence,
      credentials: store,
      authorityContexts,
      deletionGuard: new FixedPersonalModelDeletionGuard({ status: "clear" }),
      credentialUsage: new FixedPersonalCredentialReferenceUsage({ status: "unused" }),
      operationGate,
      clock,
    });
    const command = createPersonalModelCredentialCommand({
      commandId: randomUUID(),
      commandType: "create",
      personalModelId: "model.personal.keychain-test",
      target: {
        providerKind: "deepseek",
        providerProfileRevision: `sha256:${"a".repeat(64)}`,
        protocol: "openai_compatible",
        endpoint: "https://api.example.com/v1",
        providerModelId: "deepseek-test",
        displayName: "Keychain Test",
        capabilities: ["streaming", "text"],
      },
      credentialInputExpected: true,
    });
    const secret = randomBytes(48);
    const expectedSecret = Uint8Array.from(secret);
    try {
      await persistence.start();
      await store.start();
      expect(await coordinator.prepare(command)).toMatchObject({ ok: true, status: "prepared" });
      expect(await coordinator.executePrepared({
        commandId: command.commandId,
        commandType: command.commandType,
        personalModelId: command.personalModelId,
        requestDigest: command.requestDigest,
        deadlineAt: "2026-08-21T09:05:00.000Z",
        secret,
      })).toMatchObject({ ok: true, status: "committed" });
      expect([...secret]).toEqual(new Array(secret.byteLength).fill(0));

      const namespace = await persistence.loadActiveOwnerNamespace();
      if (namespace === undefined) throw new Error("expected owner namespace");
      const owner = derivePersonalModelOwnerIdentity(namespace, authorityContext);
      namespace.namespaceKey.fill(0);
      const head = await persistence.loadHead(owner, command.personalModelId);
      if (head === undefined) throw new Error("expected Personal Model head");
      const revealService = new PersonalModelCredentialRevealService({
        persistence,
        credentials: store,
        authorityContexts,
        operationGate,
        attempts: new PersonalModelRevealAttemptRegistry(),
        clock,
      });
      const revealCommand = createPersonalModelRevealCommand({
        commandId: randomUUID(),
        commandType: "reveal",
        personalModelId: command.personalModelId,
        expectedConfigurationRevision: head.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
        deadlineAt: "2026-08-21T09:00:05.000Z",
      });
      const revealed = await revealService.reveal(revealCommand);
      expect(revealed).toMatchObject({ ok: true, status: "completed" });
      if (revealed.ok) {
        expect([...revealed.secret]).toEqual([...expectedSecret]);
        revealed.secret.fill(0);
      }
      revealService.close();
    } finally {
      secret.fill(0);
      expectedSecret.fill(0);
      await store.stop();
      await persistence.stop();
      await fixture.destroy();
    }
  }, 30_000);
});

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a21-"));
  temporaryDirectories.push(directory);
  const helperPath = join(directory, "Resources", "robothree-personal-credential-helper");
  const setupHelperPath = join(directory, "test-keychain-helper");
  const keychainPath = join(directory, "isolated.keychain-db");
  await execFile("/bin/mkdir", ["-p", join(directory, "Resources")]);
  await Promise.all([
    compile(resolve("services/core/native/macos/robothree-personal-credential-helper.m"), helperPath),
    compile(resolve("scripts/dfi4a0-keychain-helper.m"), setupHelperPath),
  ]);
  const password = randomBytes(32);
  await setupCommand(setupHelperPath, {
    protocolVersion: 1,
    command: "create_test_keychain",
    keychainPath,
    keychainPasswordBase64: password.toString("base64"),
  });
  const bytes = await readFile(helperPath);
  const manifestSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  bytes.fill(0);
  let destroyed = false;
  return {
    directory,
    descriptor: {
      helperPath,
      packageRootPath: directory,
      manifestSha256,
      protocolVersion: "personal-keychain-helper.v1" as const,
      activation: "test_isolated" as const,
      testKeychainPath: keychainPath,
    },
    lock: async () => setupCommand(setupHelperPath, {
      protocolVersion: 1,
      command: "lock",
      keychainPath,
    }),
    unlock: async () => setupCommand(setupHelperPath, {
      protocolVersion: 1,
      command: "unlock",
      keychainPath,
      keychainPasswordBase64: password.toString("base64"),
    }),
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      try {
        await setupCommand(setupHelperPath, {
          protocolVersion: 1,
          command: "destroy_test_keychain",
          keychainPath,
        }).catch(() => undefined);
      } finally {
        password.fill(0);
      }
    },
  };
}

async function createCrashWrapper(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  mode: "before_mutation" | "after_mutation",
) {
  const wrapperPath = join(fixture.directory, "Resources", `crash-${mode}.cjs`);
  const markerPath = join(fixture.directory, `${mode}.marker`);
  const script = `#!${process.execPath}
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
process.stdin.on("end", () => {
  const input = Buffer.concat(chunks);
  if (!fs.existsSync(${JSON.stringify(markerPath)})) {
    fs.writeFileSync(${JSON.stringify(markerPath)}, "1", { mode: 0o600 });
    if (${JSON.stringify(mode)} === "before_mutation") {
      input.fill(0);
      process.exit(91);
    }
    const child = spawn(${JSON.stringify(fixture.descriptor.helperPath)}, [], {
      env: {}, stdio: ["pipe", "pipe", "ignore"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
    child.once("exit", () => {
      for (const chunk of output) chunk.fill(0);
      input.fill(0);
      process.exit(92);
    });
    child.stdin.end(input, () => input.fill(0));
    return;
  }
  const child = spawn(${JSON.stringify(fixture.descriptor.helperPath)}, [], {
    env: {}, stdio: ["pipe", "pipe", "ignore"],
  });
  child.stdout.pipe(process.stdout);
  child.once("exit", (code) => {
    input.fill(0);
    process.exit(code ?? 1);
  });
  child.stdin.end(input, () => input.fill(0));
});
`;
  await writeFile(wrapperPath, script, { mode: 0o755 });
  await chmod(wrapperPath, 0o755);
  const bytes = await readFile(wrapperPath);
  const manifestSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  bytes.fill(0);
  return {
    ...fixture.descriptor,
    helperPath: wrapperPath,
    manifestSha256,
  };
}

async function compile(source: string, output: string): Promise<void> {
  await execFile("/usr/bin/xcrun", [
    "clang",
    "-fobjc-arc",
    "-framework", "Foundation",
    "-framework", "Security",
    source,
    "-o", output,
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
