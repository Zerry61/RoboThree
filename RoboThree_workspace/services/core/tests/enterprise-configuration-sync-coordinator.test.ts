import { describe, expect, it } from "vitest";

import {
  EnterpriseConfigurationClientError,
  EnterpriseConfigurationSyncCoordinator,
  ConfigurationValidator,
  FakeClock,
  InMemoryEnterpriseConfigurationPersistence,
  canonicalJson,
  type EnterpriseConfigurationClient,
  type EnterpriseConfigurationDocumentResult,
  type EnterpriseConfigurationPackageReadRequest,
  type EnterpriseConfigurationReadOperation,
  type EnterpriseIdentityScope,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
  otherEnterpriseScope,
} from "./enterprise-configuration.fixtures.js";

describe("CGF-1.2C enterprise configuration sync coordinator", () => {
  it("activates an exact snapshot and converges a subsequent ETag 304", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    const { coordinator, persistence } = await harness(client);

    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({
        ok: true,
        outcome: "activated",
      });
    client.snapshotMode = "not_modified";
    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({
        ok: true,
        outcome: "not_modified",
      });
    expect(client.snapshotRequests).toEqual([
      undefined,
      fixture.snapshot.etag,
    ]);
    expect(await persistence.loadSyncFacts(enterpriseScope)).toEqual({
      lastSuccessfulSyncAt: "2026-07-26T00:00:00.000Z",
    });
  });

  it("repairs a 304 when no complete local generation exists", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    client.snapshotMode = "not_modified_once";
    const { coordinator, persistence } = await harness(client);

    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({ ok: true, outcome: "activated" });
    expect(client.snapshotRequests).toEqual([undefined, undefined]);
    expect(await persistence.loadActive(enterpriseScope)).toBeDefined();
  });

  it("fails closed on a truncated Snapshot body before staging", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    client.snapshotMode = "truncated";
    const { coordinator, persistence } = await harness(client);

    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toEqual({
        ok: false,
        errorCode: "configuration.invalid_json",
      });
    expect(await persistence.loadActive(enterpriseScope)).toBeUndefined();
    expect(await persistence.diagnostics(enterpriseScope)).toMatchObject({
      candidateCount: 0,
    });
  });

  it("preserves the last active generation on offline and validation failure", async () => {
    const first = createEnterpriseConfigurationFixture({ marker: "one" });
    const client = new ScriptedConfigurationClient(first);
    const { coordinator, persistence } = await harness(client);
    const activated = await coordinator.sync({ scope: enterpriseScope });
    expect(activated.ok).toBe(true);
    const original = await persistence.loadActive(enterpriseScope);

    client.snapshotMode = "offline";
    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toEqual({
        ok: false,
        errorCode: "configuration.client_offline",
      });
    expect(await persistence.loadActive(enterpriseScope)).toEqual(original);
    expect(await persistence.loadSyncFacts(enterpriseScope)).toEqual({
      lastSuccessfulSyncAt: "2026-07-26T00:00:00.000Z",
      lastErrorCode: "configuration.client_offline",
    });

    client.snapshotMode = "modified";
    client.corruptNextPackage = true;
    client.fixture = createEnterpriseConfigurationFixture({ marker: "two" });
    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({
        ok: false,
        errorCode: "configuration.digest_mismatch",
      });
    expect(await persistence.loadActive(enterpriseScope)).toEqual(original);
  });

  it("serializes the same scope while allowing bounded work across scopes", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    client.delayMs = 15;
    const { coordinator } = await harness(client, 2);

    const sameScope = await Promise.all([
      coordinator.sync({ scope: enterpriseScope }),
      coordinator.sync({ scope: enterpriseScope }),
    ]);
    expect(sameScope.every((item) => item.ok)).toBe(true);
    expect(client.maximumActiveOperations).toBe(1);

    client.maximumActiveOperations = 0;
    await Promise.all([
      coordinator.sync({ scope: enterpriseScope }),
      coordinator.sync({ scope: otherEnterpriseScope }),
    ]);
    expect(client.maximumActiveOperations).toBeGreaterThanOrEqual(2);
    expect(client.maximumPackageReads).toBeLessThanOrEqual(2);
  });

  it("honors the configured four-download bound without unbounded fan-out", async () => {
    const fixture = createEnterpriseConfigurationFixture({
      agentCount: 1,
      skillCount: 7,
    });
    const client = new ScriptedConfigurationClient(fixture);
    client.delayMs = 10;
    const { coordinator } = await harness(client, 4);

    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({ ok: true, outcome: "activated" });
    expect(client.maximumPackageReads).toBe(4);
  });

  it("propagates caller cancellation without activating partial staging", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    client.delayMs = 50;
    const { coordinator, persistence } = await harness(client);
    const controller = new AbortController();
    const pending = coordinator.sync({
      scope: enterpriseScope,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: "configuration.client_cancelled",
    });
    expect(await persistence.loadActive(enterpriseScope)).toBeUndefined();
  });

  it("resumes a partially staged candidate without downloading a validated package twice", async () => {
    const fixture = createEnterpriseConfigurationFixture();
    const client = new ScriptedConfigurationClient(fixture);
    client.failPackageReadAt = 2;
    const { coordinator, persistence } = await harness(client);

    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toEqual({
        ok: false,
        errorCode: "configuration.client_offline",
      });
    expect((await persistence.loadCandidate(
      fixture.materialized.identity.candidateKey,
    ))?.packages).toHaveLength(1);

    client.failPackageReadAt = undefined;
    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toMatchObject({ ok: true, outcome: "activated" });
    expect(client.packageReadCount).toBe(3);
  });

  it("does not follow a Central active switch after locking the snapshot", async () => {
    const first = createEnterpriseConfigurationFixture({ marker: "one" });
    const client = new ScriptedConfigurationClient(first);
    const { coordinator, persistence } = await harness(client);
    await coordinator.sync({ scope: enterpriseScope });
    const oldActive = await persistence.loadActive(enterpriseScope);

    client.fixture = createEnterpriseConfigurationFixture({ marker: "two" });
    client.switchAfterSnapshot =
      createEnterpriseConfigurationFixture({ marker: "three" });
    await expect(coordinator.sync({ scope: enterpriseScope }))
      .resolves.toEqual({
        ok: false,
        errorCode: "configuration.sync_failed",
      });
    expect(await persistence.loadActive(enterpriseScope)).toEqual(oldActive);
  });
});

class ScriptedConfigurationClient implements EnterpriseConfigurationClient {
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>;
  snapshotMode:
    | "modified"
    | "not_modified"
    | "not_modified_once"
    | "offline"
    | "truncated"
    = "modified";
  snapshotRequests: Array<string | undefined> = [];
  corruptNextPackage = false;
  delayMs = 0;
  activeOperations = 0;
  maximumActiveOperations = 0;
  activePackageReads = 0;
  maximumPackageReads = 0;
  packageReadCount = 0;
  failPackageReadAt: number | undefined;
  switchAfterSnapshot:
    ReturnType<typeof createEnterpriseConfigurationFixture> | undefined;

  constructor(fixture: ReturnType<typeof createEnterpriseConfigurationFixture>) {
    this.fixture = fixture;
  }

  beginRead(scope: EnterpriseIdentityScope): EnterpriseConfigurationReadOperation {
    this.activeOperations += 1;
    this.maximumActiveOperations = Math.max(
      this.maximumActiveOperations,
      this.activeOperations,
    );
    let completed = false;
    const finish = (): void => {
      if (completed) return;
      completed = true;
      this.activeOperations -= 1;
    };
    return {
      scope,
      readSnapshot: async (input = {}) => {
        this.snapshotRequests.push(input.ifNoneMatch);
        await this.#wait(input.signal);
        if (this.snapshotMode === "offline") {
          finish();
          throw new EnterpriseConfigurationClientError(
            "configuration.client_offline",
            "test service unavailable",
          );
        }
        if (this.snapshotMode === "truncated") {
          finish();
          return modified("{", "\"snapshot-truncated\"");
        }
        if (this.snapshotMode === "not_modified"
          || this.snapshotMode === "not_modified_once") {
          if (this.snapshotMode === "not_modified_once") {
            this.snapshotMode = "modified";
          }
          return {
            status: "not_modified",
            etag: this.fixture.snapshot.etag ?? "\"snapshot\"",
          };
        }
        const response = modified(
          canonicalJson(this.fixture.snapshot.document),
          this.fixture.snapshot.etag ?? "\"snapshot\"",
        );
        if (this.switchAfterSnapshot !== undefined) {
          this.fixture = this.switchAfterSnapshot;
          this.switchAfterSnapshot = undefined;
        }
        return response;
      },
      readPackage: async (input) => {
        this.packageReadCount += 1;
        this.activePackageReads += 1;
        this.maximumPackageReads = Math.max(
          this.maximumPackageReads,
          this.activePackageReads,
        );
        try {
          await this.#wait(input.signal);
          if (this.failPackageReadAt === this.packageReadCount) {
            throw new EnterpriseConfigurationClientError(
              "configuration.client_offline",
              "test package transport interrupted",
            );
          }
          const item = this.#findPackage(input);
          const rawJson = canonicalJson(item.document);
          if (this.corruptNextPackage) {
            this.corruptNextPackage = false;
            return modified(
              rawJson.replace(item.document.packageDigest, "0".repeat(64)),
              item.etag ?? "\"package\"",
            );
          }
          return modified(rawJson, item.etag ?? "\"package\"");
        } finally {
          this.activePackageReads -= 1;
        }
      },
      assertReadyToSeal: async () => {
        finish();
      },
    };
  }

  async #wait(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) throw cancelled();
    if (this.delayMs === 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(cancelled());
      }, { once: true });
    });
  }

  #findPackage(input: EnterpriseConfigurationPackageReadRequest) {
    const item = this.fixture.packages.find((candidate) =>
      candidate.reference.kind === input.reference.kind
      && candidate.reference.packageId === input.reference.packageId
      && candidate.reference.revision === input.reference.revision
      && candidate.reference.digest === input.reference.digest);
    if (item === undefined) throw new Error("test package not found");
    return item;
  }
}

function modified(
  rawJson: string,
  etag: string,
): EnterpriseConfigurationDocumentResult {
  return {
    status: "modified",
    rawJson,
    etag,
    byteLength: Buffer.byteLength(rawJson),
  };
}

function cancelled(): EnterpriseConfigurationClientError {
  return new EnterpriseConfigurationClientError(
    "configuration.client_cancelled",
    "test operation cancelled",
  );
}

async function harness(
  client: EnterpriseConfigurationClient,
  packageDownloadConcurrency = 1,
) {
  const clock = new FakeClock("2026-07-26T00:00:00.000Z");
  const persistence = new InMemoryEnterpriseConfigurationPersistence({ clock });
  await persistence.start();
  const coordinator = new EnterpriseConfigurationSyncCoordinator({
    client,
    persistence,
    clock,
    validator: new ConfigurationValidator({
      desktopVersion: "0.0.0",
      coreVersion: "0.0.0",
      supportsContractVersion: (version) => version === "v1alpha1",
      isDesktopCompatible: () => true,
      isCoreCompatible: () => true,
    }),
    options: { packageDownloadConcurrency },
  });
  return { coordinator, persistence };
}
