import { createReadStream, createWriteStream } from "node:fs";
import { isAbsolute } from "node:path";

import {
  createDesktopPrivateRuntime,
  type DesktopPrivateRuntime,
} from "./bootstrap/create-desktop-private-runtime.js";
import { PersonalCredentialBrokerServer } from "./adapters/credential/personal-credential-broker-server.js";

type BootMessage = Readonly<{
  type: "desktop.core.boot";
  authorizationToken: string;
  databasePath: string;
  clientInstanceId: string;
  sensitiveChannelInstanceId?: string;
  demoMode?: "dcf2c";
}>;

type ShutdownMessage = Readonly<{ type: "desktop.core.shutdown" }>;

let runtime: DesktopPrivateRuntime | undefined;
let credentialBroker: PersonalCredentialBrokerServer | undefined;
let starting = false;

process.on("message", (message: unknown) => {
  void handleMessage(message);
});

process.once("SIGTERM", () => {
  void shutdown(0);
});

process.once("SIGINT", () => {
  void shutdown(0);
});

async function handleMessage(message: unknown): Promise<void> {
  if (isShutdown(message)) {
    await shutdown(0);
    return;
  }
  if (!isBoot(message) || runtime !== undefined || starting) return;
  starting = true;
  try {
    const created = createDesktopPrivateRuntime({
      databasePath: message.databasePath,
      authorizationToken: message.authorizationToken,
      ...(message.demoMode === undefined
        ? {}
        : { demoMode: message.demoMode }),
    });
    runtime = created;
    await created.start();
    if (message.sensitiveChannelInstanceId !== undefined) {
      const streams = openSensitiveChannel();
      if (streams !== undefined) {
        credentialBroker = new PersonalCredentialBrokerServer({
          ...streams,
          channelInstanceId: message.sensitiveChannelInstanceId,
          clientInstanceId: message.clientInstanceId,
          handler: async () => ({
            status: "rejected",
            typedErrorCode: "credential_store_unavailable",
          }),
        });
        credentialBroker.start();
      }
    }
    process.send?.({
      type: "desktop.core.ready",
      host: "127.0.0.1",
      port: created.server.port,
      runtimeInstanceId: created.facade.runtimeInstanceId,
      coreVersion: "0.0.0-dfi.4a.2.3",
    });
  } catch {
    process.send?.({
      type: "desktop.core.failed",
      reason: "Local Core failed to start",
    });
    await shutdown(1);
  } finally {
    starting = false;
  }
}

async function shutdown(exitCode: number): Promise<void> {
  const current = runtime;
  runtime = undefined;
  credentialBroker?.close();
  credentialBroker = undefined;
  await current?.stop().catch(() => undefined);
  process.exitCode = exitCode;
  process.disconnect?.();
}

function isBoot(value: unknown): value is BootMessage {
  if (!isRecord(value)) return false;
  return value.type === "desktop.core.boot"
    && typeof value.authorizationToken === "string"
    && value.authorizationToken.length >= 32
    && typeof value.databasePath === "string"
    && isAbsolute(value.databasePath)
    && isUuid(value.clientInstanceId)
    && (value.sensitiveChannelInstanceId === undefined
      || isUuid(value.sensitiveChannelInstanceId))
    && (value.demoMode === undefined || value.demoMode === "dcf2c");
}

function openSensitiveChannel(): Readonly<{
  request: ReturnType<typeof createReadStream>;
  response: ReturnType<typeof createWriteStream>;
}> | undefined {
  try {
    return {
      request: createReadStream("/dev/null", { fd: 4, autoClose: false }),
      response: createWriteStream("/dev/null", { fd: 5, autoClose: false }),
    };
  } catch {
    return undefined;
  }
}

function isShutdown(value: unknown): value is ShutdownMessage {
  return isRecord(value) && value.type === "desktop.core.shutdown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value);
}
