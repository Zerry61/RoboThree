import { createReadStream, createWriteStream } from "node:fs";

import {
  ConservativePersonalCredentialReferenceUsage,
  ConservativePersonalModelDeletionGuard,
  FixedPersonalModelOwnerAuthorityContextProvider,
  InMemoryPersonalModelOperationGate,
  MacOsKeychainPersonalCredentialStore,
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialRevealService,
  PersonalModelRevealAttemptRegistry,
  SqlitePersonalModelPersistence,
  SystemClock,
  createPersonalModelCredentialBrokerHandler,
  derivePersonalModelOwnerIdentity,
} from "../../dist/index.js";
import { PersonalCredentialBrokerServer } from
  "../../dist/adapters/credential/personal-credential-broker-server.js";

let runtime;
let starting = false;
let barrierRelease;

process.on("message", (message) => {
  void handleMessage(message);
});

process.once("SIGTERM", () => { void stop(0); });
process.once("SIGINT", () => { void stop(0); });

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "shutdown") {
    await stop(0);
    return;
  }
  if (message.type === "release_barrier") {
    barrierRelease?.();
    barrierRelease = undefined;
    return;
  }
  if (message.type === "boot" && runtime === undefined && !starting) {
    starting = true;
    try {
      runtime = await createRuntime(message);
      process.send?.({ type: "ready", pid: process.pid });
    } catch {
      process.send?.({ type: "failed", errorCode: "fixture_start_failed" });
      await stop(1);
    } finally {
      starting = false;
    }
    return;
  }
  if (runtime === undefined) return;
  if (message.type === "prepare") {
    const result = await runtime.coordinator.prepare(message.command);
    process.send?.({ type: "prepared", requestId: message.requestId, result });
    return;
  }
  if (message.type === "head") {
    const namespace = await runtime.persistence.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      process.send?.({ type: "head", requestId: message.requestId });
      return;
    }
    try {
      const owner = derivePersonalModelOwnerIdentity(namespace, runtime.authorityContext);
      const head = await runtime.persistence.loadHead(owner, message.personalModelId);
      process.send?.({
        type: "head",
        requestId: message.requestId,
        ...(head === undefined ? {} : {
          head: {
            currentConfigurationRevision: head.currentConfigurationRevision,
            currentExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
            selectionState: head.selectionState,
          },
        }),
      });
    } finally {
      namespace.namespaceKey.fill(0);
    }
    return;
  }
  if (message.type === "resources") {
    process.send?.({
      type: "resources",
      requestId: message.requestId,
      broker: runtime.broker.resourceSnapshot(),
      reveal: runtime.reveal.resourceSnapshot(),
      resolveCount: runtime.credentials.resolveCount,
    });
  }
}

async function createRuntime(message) {
  const clock = new SystemClock();
  const persistence = new SqlitePersonalModelPersistence({
    databasePath: message.databasePath,
    clock,
  });
  const rawCredentials = new MacOsKeychainPersonalCredentialStore({ descriptor: message.descriptor });
  const credentials = new BarrierCredentialStore(rawCredentials, message.barrierMode);
  const authorityContexts = new FixedPersonalModelOwnerAuthorityContextProvider(message.authorityContext);
  const operationGate = new InMemoryPersonalModelOperationGate();
  await persistence.start();
  await credentials.start();
  const coordinator = new PersonalModelCredentialCoordinator({
    persistence,
    credentials,
    authorityContexts,
    deletionGuard: new ConservativePersonalModelDeletionGuard(),
    credentialUsage: new ConservativePersonalCredentialReferenceUsage(),
    operationGate,
    clock,
  });
  const reveal = new PersonalModelCredentialRevealService({
    persistence,
    credentials,
    authorityContexts,
    operationGate,
    attempts: new PersonalModelRevealAttemptRegistry(),
    clock,
  });
  const broker = new PersonalCredentialBrokerServer({
    request: createReadStream("/dev/null", { fd: 4, autoClose: false }),
    response: createWriteStream("/dev/null", { fd: 5, autoClose: false }),
    channelInstanceId: message.channelInstanceId,
    clientInstanceId: message.clientInstanceId,
    handler: createPersonalModelCredentialBrokerHandler(coordinator, reveal),
  });
  broker.start();
  return {
    authorityContext: message.authorityContext,
    persistence,
    credentials,
    coordinator,
    reveal,
    broker,
  };
}

class BarrierCredentialStore {
  resolveCount = 0;

  constructor(delegate, mode) {
    this.delegate = delegate;
    this.mode = mode;
  }

  start() { return this.delegate.start(); }
  stop() { return this.delegate.stop(); }
  store(operationId, credentialRef, secret) {
    return this.delegate.store(operationId, credentialRef, secret);
  }
  replace(operationId, oldRef, newRef, secret) {
    return this.delegate.replace(operationId, oldRef, newRef, secret);
  }
  async inspect(credentialRef) {
    if (this.mode === "V1") await barrier("V1", this.resolveCount);
    return this.delegate.inspect(credentialRef);
  }
  async resolve(credentialRef) {
    this.resolveCount += 1;
    const result = await this.delegate.resolve(credentialRef);
    if (this.mode === "V2a" && result.ok) await barrier("V2a", this.resolveCount);
    return result;
  }
  delete(operationId, credentialRef) {
    return this.delegate.delete(operationId, credentialRef);
  }
}

async function barrier(name, resolveCount) {
  process.send?.({ type: "barrier", name, resolveCount });
  await new Promise((resolve) => { barrierRelease = resolve; });
}

async function stop(exitCode) {
  const current = runtime;
  runtime = undefined;
  current?.broker.close();
  current?.reveal.close();
  await current?.credentials.stop().catch(() => undefined);
  await current?.persistence.stop().catch(() => undefined);
  process.exitCode = exitCode;
  process.disconnect?.();
}
