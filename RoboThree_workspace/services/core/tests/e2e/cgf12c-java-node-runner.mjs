import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import {
  ConfigurationValidator,
  EnterpriseConfigurationSyncCoordinator,
  HttpEnterpriseConfigurationClient,
  SqliteEnterpriseConfigurationPersistence,
  SystemClock,
} from "../../dist/index.js";

const baseUrl = requiredEnvironment("ROBOTHREE_CGF12C_BASE_URL");
const compactToken = requiredEnvironment("ROBOTHREE_CGF12C_ACCESS_TOKEN");
const databasePath = requiredEnvironment("ROBOTHREE_CGF12C_DATABASE_PATH");
const scope = Object.freeze({
  enterpriseId: "enterprise.alpha",
  userId: "user.alpha",
  deviceId: "device.alpha",
  clientInstanceId: "50000000-0000-4000-8000-000000000005",
});
const clock = new SystemClock();
const provider = {
  acquire: async () => tokenLease(),
  renew: async () => tokenLease(),
  assertCurrentSession: async (expectedScope, requiredPermission) => {
    if (JSON.stringify(expectedScope) !== JSON.stringify(scope)
      || requiredPermission !== "configuration.read") {
      throw new Error("enterprise session facts changed");
    }
  },
};
const client = new HttpEnterpriseConfigurationClient({
  baseUrl,
  audience: "robothree-central",
  tokenProvider: provider,
  requestTimeoutMs: 5_000,
  allowInsecureLoopbackForTest: true,
});
const validator = new ConfigurationValidator({
  desktopVersion: "0.0.0-dcf.1.0",
  coreVersion: "0.0.0-cgf.1.2c",
  supportsContractVersion: (version) => version === "v1alpha1",
  isDesktopCompatible: () => true,
  isCoreCompatible: () => true,
});

const firstPersistence = new SqliteEnterpriseConfigurationPersistence({
  databasePath,
  clock,
});
await firstPersistence.start();
const first = await new EnterpriseConfigurationSyncCoordinator({
  client,
  validator,
  persistence: firstPersistence,
  clock,
  options: { packageDownloadConcurrency: 1 },
}).sync({ scope });
if (!first.ok || first.outcome !== "activated") {
  throw new Error(`first Java to Node synchronization failed: ${
    first.ok ? first.outcome : first.errorCode
  }`);
}
await firstPersistence.stop();

const reopened = new SqliteEnterpriseConfigurationPersistence({
  databasePath,
  clock,
});
await reopened.start();
const second = await new EnterpriseConfigurationSyncCoordinator({
  client,
  validator,
  persistence: reopened,
  clock,
  options: { packageDownloadConcurrency: 1 },
}).sync({ scope });
const active = await reopened.loadActive(scope);
const syncFacts = await reopened.loadSyncFacts(scope);
await reopened.stop();
if (!second.ok || second.outcome !== "not_modified" || active === undefined) {
  throw new Error("reopened Java to Node synchronization did not converge");
}
const databaseBytes = await readFile(databasePath);
if (databaseBytes.includes(Buffer.from(compactToken, "utf8"))) {
  throw new Error("enterprise access token entered configuration persistence");
}

process.stdout.write(`${JSON.stringify({
  status: "ready",
  first: first.outcome,
  second: second.outcome,
  snapshotId: active.configuration.identity.snapshotId,
  syncRecorded: syncFacts.lastSuccessfulSyncAt !== undefined,
})}\n`);

function tokenLease() {
  return {
    compactToken,
    tokenId: "cgf12c.e2e.token",
    audience: "robothree-central",
    permissions: ["configuration.read"],
    issuedAt: "2026-07-26T00:00:00Z",
    expiresAt: "2099-07-26T00:00:00Z",
    scope,
  };
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required E2E environment: ${name}`);
  }
  return value;
}
