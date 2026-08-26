import { describe, expect, it } from "vitest";

import {
  pendingRuntimeActivationFrom,
  projectEnterpriseConfigurationStatus,
} from "../src/application/enterprise-configuration-status.js";

const generation = (character: string) => ({
  revision: character.repeat(64),
  digest: character.repeat(64),
});

describe("EnterpriseConfigurationStatus projection", () => {
  it("derives uninitialized without a storage-active configuration", () => {
    const projection = projectEnterpriseConfigurationStatus(
      {},
      { inProgress: false },
    );
    expect(projection.activationState).toBe("uninitialized");
    expect(projection.syncState).toBe("idle");
    expect(pendingRuntimeActivationFrom(projection)).toBe(false);
  });

  it("derives current only from matching storage/runtime generations", () => {
    const active = generation("a");
    const projection = projectEnterpriseConfigurationStatus(
      {
        storageActive: active,
        runtimeActive: active,
        lastSuccessfulSyncAt: "2026-07-25T10:00:00Z",
      },
      { inProgress: false },
    );
    expect(projection.activationState).toBe("current");
    expect(pendingRuntimeActivationFrom(projection)).toBe(false);
  });

  it("derives pending restart without persisting a second boolean", () => {
    const projection = projectEnterpriseConfigurationStatus(
      {
        storageActive: generation("b"),
        runtimeActive: generation("a"),
      },
      { inProgress: true },
    );
    expect(projection.activationState).toBe("pending_restart");
    expect(projection.syncState).toBe("syncing");
    expect(pendingRuntimeActivationFrom(projection)).toBe(true);
  });

  it("reserves activation_failed for a failure targeting the current storage generation", () => {
    const projection = projectEnterpriseConfigurationStatus(
      {
        storageActive: generation("c"),
        runtimeActive: generation("a"),
        lastSyncErrorCode: "enterprise_configuration.sync_failed",
        lastActivationFailure: {
          storageRevision: "c".repeat(64),
          errorCode: "enterprise_configuration.activation_failed",
        },
      },
      { inProgress: false },
    );
    expect(projection.activationState).toBe("activation_failed");
    expect(projection.syncState).toBe("failed");
    expect(projection.lastErrorCode)
      .toBe("enterprise_configuration.activation_failed");
  });

  it("fails closed for impossible pointer facts", () => {
    expect(() => projectEnterpriseConfigurationStatus(
      { runtimeActive: generation("a") },
      { inProgress: false },
    )).toThrow("requires storage-active");

    expect(() => projectEnterpriseConfigurationStatus(
      {
        storageActive: generation("a"),
        runtimeActive: {
          revision: "a".repeat(64),
          digest: "b".repeat(64),
        },
      },
      { inProgress: false },
    )).toThrow("different storage/runtime digests");
  });
});
