import { createReadStream, createWriteStream } from "node:fs";
import { isAbsolute } from "node:path";

import {
  createDesktopPrivateRuntime,
  type DesktopPrivateRuntime,
} from "./bootstrap/create-desktop-private-runtime.js";
import { PersonalCredentialBrokerServer } from "./adapters/credential/personal-credential-broker-server.js";
import type { PersonalCredentialHelperDescriptor } from
  "./adapters/credential/personal-credential-helper-trust.js";
import {
  validateSensitiveTransportBootDescriptor,
  type SensitiveTransportBootDescriptor,
} from "./application/sensitive-transport-activation.js";

type BootMessage = Readonly<{
  type: "desktop.core.boot";
  authorizationToken: string;
  databasePath: string;
  clientInstanceId: string;
  sensitiveChannelInstanceId?: string;
  demoMode?: "dcf2c" | "legacy_test";
  credentialHelperDescriptor?: PersonalCredentialHelperDescriptor;
  sensitiveTransportActivationDescriptor?: SensitiveTransportBootDescriptor;
  dfi543TestHarness?: Readonly<{
    credentialHelperDescriptor: PersonalCredentialHelperDescriptor;
    providerCaPem: string;
    providerPort: number;
  }>;
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
    const sensitiveTransportActivationDescriptor =
      validateSensitiveTransportBootDescriptor(
        message.sensitiveTransportActivationDescriptor,
      );
    const created = createDesktopPrivateRuntime({
      databasePath: message.databasePath,
      authorizationToken: message.authorizationToken,
      clientInstanceId: message.clientInstanceId,
      ...(message.dfi543TestHarness === undefined ? {} : {
        dfi543TestHarness: message.dfi543TestHarness,
      }),
      ...(message.credentialHelperDescriptor === undefined ? {} : {
        credentialHelperDescriptor: message.credentialHelperDescriptor,
      }),
      ...(message.demoMode === undefined
        ? {}
        : { demoMode: message.demoMode }),
      sensitiveTransportProductionReady:
        sensitiveTransportActivationDescriptor !== undefined,
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
          handler: created.personalCredentialBrokerHandler,
        });
        credentialBroker.start();
      }
    }
    process.send?.({
      type: "desktop.core.ready",
      host: "127.0.0.1",
      port: created.server.port,
      runtimeInstanceId: created.facade.runtimeInstanceId,
      coreVersion: "0.0.0-dfi.4a.4.2",
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
    && (value.demoMode === undefined
      || value.demoMode === "dcf2c"
      || value.demoMode === "legacy_test")
    && isProductionCredentialHelperDescriptor(value.credentialHelperDescriptor)
    && isSensitiveTransportActivationDescriptor(
      value.sensitiveTransportActivationDescriptor,
    )
    && isDfi543TestHarness(value.dfi543TestHarness);
}

function isSensitiveTransportActivationDescriptor(value: unknown): boolean {
  if (value === undefined) return true;
  try {
    return validateSensitiveTransportBootDescriptor(value) !== undefined;
  } catch {
    return false;
  }
}

function isProductionCredentialHelperDescriptor(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const expectedKeys = [
    "activation",
    "designatedRequirement",
    "helperPath",
    "manifestSha256",
    "packageRootPath",
    "protocolVersion",
    "teamIdentifier",
  ];
  return Object.keys(value).sort().join(",") === expectedKeys.sort().join(",")
    && typeof value.helperPath === "string"
    && isAbsolute(value.helperPath)
    && typeof value.packageRootPath === "string"
    && isAbsolute(value.packageRootPath)
    && typeof value.manifestSha256 === "string"
    && /^sha256:[0-9a-f]{64}$/u.test(value.manifestSha256)
    && value.protocolVersion === "personal-keychain-helper.v1"
    && value.activation === "production_verified"
    && typeof value.designatedRequirement === "string"
    && value.designatedRequirement.length >= 8
    && typeof value.teamIdentifier === "string"
    && /^[A-Z0-9]{6,20}$/u.test(value.teamIdentifier)
    && value.testKeychainPath === undefined;
}

function isDfi543TestHarness(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !isRecord(value.credentialHelperDescriptor)) return false;
  const descriptor = value.credentialHelperDescriptor;
  return typeof descriptor.helperPath === "string"
    && isAbsolute(descriptor.helperPath)
    && typeof descriptor.packageRootPath === "string"
    && isAbsolute(descriptor.packageRootPath)
    && typeof descriptor.manifestSha256 === "string"
    && descriptor.protocolVersion === "personal-keychain-helper.v1"
    && descriptor.activation === "test_isolated"
    && typeof descriptor.testKeychainPath === "string"
    && isAbsolute(descriptor.testKeychainPath)
    && typeof value.providerCaPem === "string"
    && value.providerCaPem.includes("BEGIN CERTIFICATE")
    && typeof value.providerPort === "number"
    && Number.isInteger(value.providerPort)
    && value.providerPort > 0
    && value.providerPort <= 65_535;
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
