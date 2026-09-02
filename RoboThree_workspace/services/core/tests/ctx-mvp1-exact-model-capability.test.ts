import {
  CONTRACT_VERSION,
  TaskCapabilityLockSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import { CalibratedTokenEstimator } from
  "../src/application/calibrated-token-estimator.js";
import {
  createExactModelCapabilityProfile,
  encodeExactModelCapabilityProfile,
  resolveExactModelCapabilityProfile,
} from "../src/application/exact-model-capability-profile.js";
import type { ExactModelCapabilityProfileError } from
  "../src/application/exact-model-capability-profile.js";
import {
  RoundOutputRequirementResolver,
  WORKSPACE_TEXT_WRITE_CAPABILITY_ID,
} from "../src/application/round-output-requirement.js";
import type { RoundOutputRequirementError } from
  "../src/application/round-output-requirement.js";
import { TaskContextBudgetResolver } from
  "../src/application/task-context-budget-resolver.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/registry/capability-revision.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";

const source = Object.freeze({
  trust: "enterprise" as const,
  packageId: "enterprise.model.ctx-mvp1",
  packageRevision: `sha256:${"a".repeat(64)}`,
});

describe("CTX-MVP-1 exact Model capability and output admission", () => {
  it("locks context, max output and profile revision through existing configuration refs", () => {
    const profile = createExactModelCapabilityProfile({
      capabilityId: "model.ctx-mvp1",
      modelFamily: "openai-compatible",
      contextWindowTokens: 400_000,
      maxOutputTokens: 128_000,
    });
    const reference = encodeExactModelCapabilityProfile(profile);
    const lock = modelLock({
      contextWindowTokens: profile.contextWindowTokens,
      configurationRef: reference,
    });

    expect(resolveExactModelCapabilityProfile(lock)).toEqual(profile);
    expect(lock.adapterDescriptorSnapshot.configurationRef).toBe(reference);
    expect(lock.bindingSnapshot.configurationRef).toBe(reference);
    expect(sha256CanonicalJson(lock)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("fails closed for a new Task when an exact output capability is absent", () => {
    const lock = modelLock({ contextWindowTokens: 128_000 });

    expect(() => resolveExactModelCapabilityProfile(lock)).toThrowError(
      expect.objectContaining<Partial<ExactModelCapabilityProfileError>>({
        code: "model.capability_profile_unavailable",
      }),
    );
    expect(resolveExactModelCapabilityProfile(lock, {
      allowLegacyTaskLock: true,
    })).toMatchObject({
      contextWindowTokens: 128_000,
      maxOutputTokens: 1_024,
      source: "legacy_task_lock",
    });
  });

  it("rejects revision, context and dual-reference drift", () => {
    const profile = createExactModelCapabilityProfile({
      capabilityId: "model.ctx-mvp1",
      modelFamily: "openai-compatible",
      contextWindowTokens: 400_000,
      maxOutputTokens: 128_000,
    });
    const reference = encodeExactModelCapabilityProfile(profile);
    const exact = modelLock({
      contextWindowTokens: 400_000,
      configurationRef: reference,
    });
    const candidates = [
      {
        ...exact,
        definitionSnapshot: {
          ...exact.definitionSnapshot,
          model: { ...exact.definitionSnapshot.model, contextWindow: 128_000 },
        },
      },
      {
        ...exact,
        bindingSnapshot: {
          ...exact.bindingSnapshot,
          configurationRef: `${reference}x`,
        },
      },
      {
        ...exact,
        adapterDescriptorSnapshot: {
          ...exact.adapterDescriptorSnapshot,
          configurationRef: reference.replace(/.$/u, "0"),
        },
      },
    ];

    for (const candidate of candidates) {
      expect(() => resolveExactModelCapabilityProfile(candidate as TaskCapabilityLock))
        .toThrowError(expect.objectContaining({
          code: "model.capability_profile_invalid",
        }));
    }
  });

  it("admits ordinary work on a 4K-output Model without global 8K rejection", () => {
    const resolver = new RoundOutputRequirementResolver({
      estimator: new CalibratedTokenEstimator(),
    });
    const profile = createExactModelCapabilityProfile({
      capabilityId: "model.ctx-mvp1",
      modelFamily: "openai-compatible",
      contextWindowTokens: 128_000,
      maxOutputTokens: 4_096,
    });

    expect(resolver.resolve({ profile })).toEqual({
      materialKind: "ordinary",
      requiredOutputTokens: 4_096,
      reservedOutputTokens: 4_096,
      lockedMaxOutputTokens: 4_096,
    });
  });

  it("derives the frozen 8K, 128K and 400K input thresholds from each exact lock", () => {
    const resolver = new TaskContextBudgetResolver({
      estimator: new CalibratedTokenEstimator(),
    });
    const cases = [
      {
        contextWindowTokens: 8_192,
        maxOutputTokens: 1_024,
        expected: {
          reservedOutputTokens: 1_024,
          safetyMarginTokens: 512,
          availableInputTokens: 6_656,
          minimumHeadroomTokens: 2_048,
          compactionThresholdTokens: 4_608,
        },
      },
      {
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
        expected: {
          reservedOutputTokens: 8_192,
          safetyMarginTokens: 2_560,
          availableInputTokens: 117_248,
          minimumHeadroomTokens: 16_384,
          compactionThresholdTokens: 93_798,
        },
      },
      {
        contextWindowTokens: 400_000,
        maxOutputTokens: 8_192,
        expected: {
          reservedOutputTokens: 8_192,
          safetyMarginTokens: 8_000,
          availableInputTokens: 383_808,
          minimumHeadroomTokens: 32_000,
          compactionThresholdTokens: 307_046,
        },
      },
    ];

    for (const fixture of cases) {
      const profile = createExactModelCapabilityProfile({
        capabilityId: "model.ctx-mvp1",
        modelFamily: "openai-compatible",
        contextWindowTokens: fixture.contextWindowTokens,
        maxOutputTokens: fixture.maxOutputTokens,
      });
      const resolution = resolver.resolve({
        modelLock: modelLock({
          contextWindowTokens: fixture.contextWindowTokens,
          configurationRef: encodeExactModelCapabilityProfile(profile),
        }),
      });

      expect(resolution.policy.decision()).toMatchObject(fixture.expected);
    }
  });

  it("uses WTE material size and headroom before the Provider call", () => {
    const resolver = new RoundOutputRequirementResolver({
      estimator: new CalibratedTokenEstimator(),
    });
    const material = {
      kind: "workspace_text_full_replacement" as const,
      capabilityId: WORKSPACE_TEXT_WRITE_CAPABILITY_ID,
      relativePath: "site/index.html",
      expectedPreviousSha256: `sha256:${"b".repeat(64)}`,
      currentExactContent: "<main>hello</main>\n".repeat(3_000),
    };
    const largeOutput = createExactModelCapabilityProfile({
      capabilityId: "model.ctx-mvp1",
      modelFamily: "openai-compatible",
      contextWindowTokens: 128_000,
      maxOutputTokens: 128_000,
    });
    const admitted = resolver.resolve({ profile: largeOutput, material });

    expect(admitted.materialKind).toBe("workspace_text_full_replacement");
    expect(admitted.baseReplacementTokens).toBeGreaterThan(8_192);
    expect(admitted.growthHeadroomTokens).toBeGreaterThanOrEqual(1_024);
    expect(admitted.requiredOutputTokens).toBe(
      admitted.baseReplacementTokens! + admitted.growthHeadroomTokens!,
    );
    expect(admitted.reservedOutputTokens).toBe(admitted.requiredOutputTokens);

    const sameContextSmallOutput = createExactModelCapabilityProfile({
      capabilityId: "model.ctx-mvp1",
      modelFamily: "openai-compatible",
      contextWindowTokens: 128_000,
      maxOutputTokens: 4_096,
    });
    expect(() => resolver.resolve({
      profile: sameContextSmallOutput,
      material,
    })).toThrowError(expect.objectContaining<Partial<RoundOutputRequirementError>>({
      code: "workspace.file.output_capacity_insufficient",
      lockedMaxOutputTokens: 4_096,
    }));
  });

  it("uses a validated error envelope without claiming estimate is always above actual", () => {
    const estimator = new CalibratedTokenEstimator();
    const estimatedTokens = estimator.estimate({
      english: "a compact English sentence",
      chinese: "工作区文本连续编辑",
      escaped: "\\\"\\n",
    });

    expect(estimator.isWithinValidatedEnvelope({
      estimatedTokens,
      observedTokens: estimatedTokens + 1,
    })).toBe(true);
    expect(estimator.estimateWithSafetyMargin({ value: "hello" }))
      .toBeGreaterThan(estimator.estimate({ value: "hello" }));
  });
});

function modelLock(input: Readonly<{
  contextWindowTokens: number;
  configurationRef?: string;
}>): TaskCapabilityLock {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.ctx-mvp1",
    kind: "model",
    name: "CTX MVP Model",
    description: "CTX-MVP-1 focused fixture",
    source,
    model: {
      family: "openai-compatible",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: input.contextWindowTokens,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.ctx-mvp1",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
    ...(input.configurationRef === undefined
      ? {}
      : { configurationRef: input.configurationRef }),
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.ctx-mvp1",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
    ...(input.configurationRef === undefined
      ? {}
      : { configurationRef: input.configurationRef }),
  });
  return TaskCapabilityLockSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    lockId: "019f7447-a784-77b2-a716-00000000c701",
    taskId: "019f7447-a784-77b2-a716-00000000c702",
    registryRevision: `sha256:${"c".repeat(64)}`,
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: "2026-09-01T00:00:00.000Z",
  });
}
