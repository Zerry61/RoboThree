import { describe, expect, it } from "vitest";

import {
  ReasoningModeLockDomainConstants,
  ReasoningModeLockIntegrityError,
  createReasoningModeLock,
  createTaskRuntimeSelectionV1Alpha2,
  hasValidTaskRuntimeSelectionV1Alpha2,
  parseReadableTaskRuntimeSelection,
  validateReasoningModeLock,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-25T08:00:00.000Z";

function lockMaterial() {
  return {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("1"),
    taskId: id("2"),
    modelLockRef: { lockId: id("3"), lockDigest: digest("a") },
    lockedAt: at,
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("b"),
    resolution: "max_applied",
    profileRef: {
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("c"),
      profileDigest: digest("c"),
    },
    strategyRef: {
      strategyId: "reasoning.strategy.fixture",
      strategyRevision: digest("d"),
      strategyDigest: digest("e"),
      timeoutPolicyRef: "timeout.policy.fixture",
    },
  } as const;
}

function selectionMaterial() {
  return {
    schemaVersion: "v1alpha2",
    runtimeSelectionId: id("4"),
    taskId: id("2"),
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    agentDefaultModelId: "model.default",
    resolvedModelLock: {
      lockId: id("3"),
      capabilityId: "model.default",
      lockDigest: digest("a"),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("2"),
    registryRevision: digest("3"),
    createdAt: at,
    reasoningModeLock: createReasoningModeLock(lockMaterial()),
  } as const;
}

describe("DFI-5.2.1 canonical Reasoning Mode lock domain", () => {
  it("creates a deterministic domain-separated lock digest", () => {
    const first = createReasoningModeLock(lockMaterial());
    const second = createReasoningModeLock(structuredClone(lockMaterial()));
    expect(first).toEqual(second);
    expect(first.reasoningModeLockDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(ReasoningModeLockDomainConstants.digestDomain)
      .toBe("robothree.reasoning-mode-lock.v1\n");
  });

  it("fails closed on digest tamper before accepting the lock", () => {
    const lock = createReasoningModeLock(lockMaterial());
    expect(() => validateReasoningModeLock({
      ...lock,
      reasoningModeLockDigest: digest("9"),
    })).toThrow(ReasoningModeLockIntegrityError);
  });

  it("validates exact Task and Model lock binding", () => {
    const lock = createReasoningModeLock(lockMaterial());
    expect(validateReasoningModeLock(lock, {
      taskId: id("2"),
      modelLockRef: { lockId: id("3"), lockDigest: digest("a") },
    })).toEqual(lock);
    expect(() => validateReasoningModeLock(lock, { taskId: id("99") }))
      .toThrow("different Task");
    expect(() => validateReasoningModeLock(lock, {
      modelLockRef: { lockId: id("3"), lockDigest: digest("9") },
    })).toThrow("exact Model lock");
  });

  it("covers the complete Reasoning lock in Runtime Selection v1alpha2 digest", () => {
    const selection = createTaskRuntimeSelectionV1Alpha2(selectionMaterial());
    expect(hasValidTaskRuntimeSelectionV1Alpha2(selection)).toBe(true);
    expect(() => hasValidTaskRuntimeSelectionV1Alpha2({
      ...selection,
      reasoningModeLock: {
        ...selection.reasoningModeLock,
        lockedAt: "2026-08-25T08:00:01.000Z",
      },
    })).not.toThrow();
    expect(hasValidTaskRuntimeSelectionV1Alpha2({
      ...selection,
      reasoningModeLock: {
        ...selection.reasoningModeLock,
        lockedAt: "2026-08-25T08:00:01.000Z",
      },
    })).toBe(false);
  });

  it("rejects a nested lock digest even when the outer selection is freshly materialized", () => {
    const material = selectionMaterial();
    expect(() => createTaskRuntimeSelectionV1Alpha2({
      ...material,
      reasoningModeLock: {
        ...material.reasoningModeLock,
        reasoningModeLockDigest: digest("9"),
      },
    })).toThrow(ReasoningModeLockIntegrityError);
  });

  it("parses only a cryptographically valid readable Runtime Selection", () => {
    const selection = createTaskRuntimeSelectionV1Alpha2(selectionMaterial());
    expect(parseReadableTaskRuntimeSelection(selection)).toEqual(selection);
    expect(() => parseReadableTaskRuntimeSelection({
      ...selection,
      selectionDigest: digest("9"),
    })).toThrow("digest is invalid");
  });
});
