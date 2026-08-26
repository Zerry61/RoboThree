import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryDesktopReasoningModePreferencePersistence,
  InMemoryReasoningProfileSource,
  ReasoningModePreferenceService,
  ReasoningModePreviewService,
  createReasoningProfile,
} from "../src/index.js";
import type {
  DesktopReasoningModeOwnerAuthorityProvider,
  EffectiveReasoningModel,
  EffectiveReasoningModelResolver,
} from "../src/index.js";
import type { PreviewReasoningModeQuery } from "@robothree/contracts";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-25T05:00:00.000Z";
const query: PreviewReasoningModeQuery = {
  contractVersion: "v1alpha3",
  queryId: "019f7447-a784-77b2-a716-000000005101",
  correlationId: "019f7447-a784-77b2-a716-000000005102",
  clientInstanceId: "019f7447-a784-77b2-a716-000000005103",
  type: "preview_reasoning_mode",
  agentId: "agent.fixture",
};
const effectiveModel: EffectiveReasoningModel = {
  modelId: "model.fixture",
  modelRevision: digest("a"),
  subject: {
    modelCapabilityId: "model.fixture",
    modelCapabilityRevision: digest("a"),
    adapterDescriptorId: "adapter.model.fixture",
    adapterDescriptorRevision: digest("b"),
    authority: "central_enterprise",
  },
};

describe("DFI-5.1 Reasoning Mode safe Preview", () => {
  it("projects unknown and default without claiming preference persistence when owner is unavailable", async () => {
    const persistence = new InMemoryDesktopReasoningModePreferencePersistence();
    await persistence.start();
    const service = createPreview(persistence, new InMemoryReasoningProfileSource(), unavailableAuthority);
    await expect(service.preview(query)).resolves.toMatchObject({
      effectiveModelId: "model.fixture",
      maxSupport: "unknown",
      preference: "default",
      preferencePersistence: "unavailable",
      testIdentityUsed: false,
      productionIdentityReady: false,
    });
  });

  it("projects exact supported profile and independently saved test-only preference", async () => {
    const persistence = new InMemoryDesktopReasoningModePreferencePersistence();
    await persistence.start();
    const preference = new ReasoningModePreferenceService({
      persistence,
      ownerAuthority: testAuthority,
      clock: new FakeClock(at),
    });
    expect(await preference.update({
      contractVersion: "v1alpha3",
      commandId: "019f7447-a784-77b2-a716-000000005104",
      correlationId: query.correlationId,
      clientInstanceId: query.clientInstanceId,
      type: "update_reasoning_mode_preference",
      expectedPreferenceRevision: 0,
      requestedMode: "max",
    })).toMatchObject({ ok: true, replayed: false });
    const profile = createReasoningProfile({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      subject: effectiveModel.subject,
      support: "supported",
      maxStrategy: {
        strategyId: "reasoning.strategy.fixture",
        strategyRevision: digest("c"),
        strategyDigest: digest("d"),
        mappingKind: "effort_level",
        timeoutPolicyRef: "timeout.policy.fixture",
      },
    });
    await expect(createPreview(
      persistence,
      new InMemoryReasoningProfileSource([profile]),
      testAuthority,
    ).preview(query)).resolves.toMatchObject({
      maxSupport: "supported",
      preference: "max",
      preferenceRevision: 1,
      preferencePersistence: "available",
      testIdentityUsed: true,
      productionIdentityReady: false,
    });
  });

  it("keeps unsupported and unknown distinct without exposing private strategy material", async () => {
    const persistence = new InMemoryDesktopReasoningModePreferencePersistence();
    await persistence.start();
    const unsupported = createReasoningProfile({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.unsupported",
      subject: effectiveModel.subject,
      support: "unsupported",
      safeUnavailableReasonCode: "reasoning.max.unsupported",
    });
    const projection = await createPreview(
      persistence,
      new InMemoryReasoningProfileSource([unsupported]),
      testAuthority,
    ).preview(query);

    expect(projection).toMatchObject({
      maxSupport: "unsupported",
      safeUnavailableReason: "reasoning.max.unsupported",
      preference: "default",
      preferenceRevision: 0,
    });
    expect(JSON.stringify(projection)).not.toMatch(/strategy|mapping|budget|effort/iu);
  });

  it("fails closed when an exact Reasoning Profile digest is corrupted", async () => {
    const persistence = new InMemoryDesktopReasoningModePreferencePersistence();
    await persistence.start();
    const profile = createReasoningProfile({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      subject: effectiveModel.subject,
      support: "supported",
      maxStrategy: {
        strategyId: "reasoning.strategy.fixture",
        strategyRevision: digest("c"),
        strategyDigest: digest("d"),
        mappingKind: "effort_level",
        timeoutPolicyRef: "timeout.policy.fixture",
      },
    });
    const corruptedSource = {
      loadExact: async () => ({ ...profile, profileRevision: digest("f"), profileDigest: digest("f") }),
    };

    await expect(new ReasoningModePreviewService({
      models: { resolve: async () => effectiveModel },
      profiles: corruptedSource,
      preferences: persistence,
      ownerAuthority: testAuthority,
      clock: new FakeClock(at),
    }).preview(query)).rejects.toThrow("reasoning_mode.profile_integrity_invalid");
  });
});

function createPreview(
  preferences: InMemoryDesktopReasoningModePreferencePersistence,
  profiles: InMemoryReasoningProfileSource,
  ownerAuthority: DesktopReasoningModeOwnerAuthorityProvider,
): ReasoningModePreviewService {
  const models: EffectiveReasoningModelResolver<PreviewReasoningModeQuery> = {
    resolve: async () => effectiveModel,
  };
  return new ReasoningModePreviewService({
    models,
    profiles,
    preferences,
    ownerAuthority,
    clock: new FakeClock(at),
  });
}

const unavailableAuthority: DesktopReasoningModeOwnerAuthorityProvider = {
  resolve: async () => ({ state: "unavailable", testIdentityUsed: false, productionIdentityReady: false }),
};
const testAuthority: DesktopReasoningModeOwnerAuthorityProvider = {
  resolve: async () => ({
    state: "available",
    enterpriseId: "enterprise.fixture",
    userId: "user.fixture",
    deviceId: "device.fixture",
    currentClientInstanceId: query.clientInstanceId,
    authoritySource: "test_only",
    testIdentityUsed: true,
    productionIdentityReady: false,
  }),
};
