import { describe, expect, it } from "vitest";

import type {
  AuthorizationPreferenceV1Alpha2,
  TaskAuthorizationMode,
} from "@robothree/contracts";

import {
  FakeTaskAuthorizationModePolicyProvider,
  FixedTaskAuthorizationModePolicyProvider,
  MVP_TASK_AUTHORIZATION_MODE_POLICY,
  TaskAuthorizationSelectionService,
  createTaskAuthorizationModePolicySnapshot,
  hasValidTaskAuthorizationModePolicySnapshot,
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
} from "../src/index.js";

const taskId = "019f9000-0000-7000-8000-000000000001";
const runtimeSelectionId = "019f9000-0000-7000-8000-000000000002";
const runtimeSelectionDigest =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const createdAt = "2026-08-17T00:00:00.000Z";

const service = new TaskAuthorizationSelectionService();

function resolve(
  mode: TaskAuthorizationMode,
  policySnapshot = MVP_TASK_AUTHORIZATION_MODE_POLICY,
) {
  return service.resolve({
    taskId,
    runtimeSelection: {
      taskId,
      runtimeSelectionId,
      selectionDigest: runtimeSelectionDigest,
    },
    authorization: {
      kind: "explicit",
      preference: { schemaVersion: "v1alpha1", requestedMode: mode },
    },
    policySnapshot,
    createdAt,
  });
}

describe("DFI-2A.1 TaskAuthorizationSelectionService", () => {
  it.each([
    "manual_review",
    "smart_confirm",
    "task_scoped",
  ] as const)("locks explicit %s as user_selected", (mode) => {
    const result = resolve(mode);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toMatchObject({
      requestedMode: mode,
      resolvedMode: mode,
      source: "user_selected",
      policyRevision: MVP_TASK_AUTHORIZATION_MODE_POLICY.policyRevision,
    });
    expect(result.executionIdentity).toMatchObject({
      taskId,
      runtimeSelectionId,
      runtimeSelectionDigest,
      authorizationSelectionDigest:
        result.selection.authorizationSelectionDigest,
    });
    expect(hasValidTaskAuthorizationSelection(result.selection)).toBe(true);
    expect(hasValidTaskExecutionSelectionIdentity(result.executionIdentity))
      .toBe(true);
  });

  it("normalizes legacy requests honestly to smart_confirm/legacy_default", () => {
    const result = service.resolve({
      taskId,
      runtimeSelection: {
        taskId,
        runtimeSelectionId,
        selectionDigest: runtimeSelectionDigest,
      },
      authorization: { kind: "legacy" },
      policySnapshot: MVP_TASK_AUTHORIZATION_MODE_POLICY,
      createdAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toMatchObject({
      requestedMode: "smart_confirm",
      resolvedMode: "smart_confirm",
      source: "legacy_default",
    });
  });

  it("rejects unsupported explicit modes without downgrade", () => {
    const smartOnly = createTaskAuthorizationModePolicySnapshot({
      policyId: "task-authorization-policy.test.smart-only",
      supportedModes: ["smart_confirm"],
      legacyDefaultMode: "smart_confirm",
      createdAt,
    });
    expect(resolve("manual_review", smartOnly)).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.mode_unsupported" },
    });
  });

  it("rejects malformed preferences, mismatched Tasks and invalid runtime digests", () => {
    const malformed = service.resolve({
      taskId,
      runtimeSelection: {
        taskId,
        runtimeSelectionId,
        selectionDigest: runtimeSelectionDigest,
      },
      authorization: {
        kind: "explicit",
        preference: {
          schemaVersion: "v1alpha1",
          requestedMode: "smart_confirm",
          fullAccess: true,
        } as unknown as AuthorizationPreferenceV1Alpha2,
      },
      policySnapshot: MVP_TASK_AUTHORIZATION_MODE_POLICY,
      createdAt,
    });
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.preference_invalid" },
    });

    expect(service.resolve({
      taskId,
      runtimeSelection: {
        taskId: "019f9000-0000-7000-8000-000000000099",
        runtimeSelectionId,
        selectionDigest: runtimeSelectionDigest,
      },
      authorization: { kind: "legacy" },
      policySnapshot: MVP_TASK_AUTHORIZATION_MODE_POLICY,
      createdAt,
    })).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.runtime_selection_mismatch" },
    });

    expect(service.resolve({
      taskId,
      runtimeSelection: {
        taskId,
        runtimeSelectionId,
        selectionDigest: "not-a-digest",
      },
      authorization: { kind: "legacy" },
      policySnapshot: MVP_TASK_AUTHORIZATION_MODE_POLICY,
      createdAt,
    })).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.execution_identity_invalid" },
    });
  });

  it("fails closed on policy digest drift or unsupported legacy default", () => {
    expect(service.resolve({
      taskId,
      runtimeSelection: {
        taskId,
        runtimeSelectionId,
        selectionDigest: runtimeSelectionDigest,
      },
      authorization: { kind: "legacy" },
      policySnapshot: {
        ...MVP_TASK_AUTHORIZATION_MODE_POLICY,
        policyRevision:
          "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      },
      createdAt,
    })).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.policy_invalid" },
    });

    expect(service.resolve({
      taskId,
      runtimeSelection: {
        taskId,
        runtimeSelectionId,
        selectionDigest: runtimeSelectionDigest,
      },
      authorization: { kind: "legacy" },
      policySnapshot: {
        ...MVP_TASK_AUTHORIZATION_MODE_POLICY,
        supportedModes: ["manual_review"],
      },
      createdAt,
    })).toMatchObject({
      ok: false,
      error: { code: "authorization_mode.policy_invalid" },
    });
  });

  it("keeps canonical digests stable and separates mode/policy revisions", () => {
    const first = resolve("smart_confirm");
    const replay = resolve("smart_confirm");
    const changedMode = resolve("task_scoped");
    const changedPolicy = resolve(
      "smart_confirm",
      createTaskAuthorizationModePolicySnapshot({
        policyId: "task-authorization-policy.mvp.fixed",
        supportedModes: ["manual_review", "smart_confirm", "task_scoped"],
        legacyDefaultMode: "smart_confirm",
        createdAt: "2026-08-17T00:00:01.000Z",
      }),
    );
    expect(first.ok && replay.ok && changedMode.ok && changedPolicy.ok).toBe(true);
    if (!first.ok || !replay.ok || !changedMode.ok || !changedPolicy.ok) return;
    expect(replay).toEqual(first);
    expect(changedMode.selection.authorizationSelectionDigest)
      .not.toBe(first.selection.authorizationSelectionDigest);
    expect(changedMode.executionIdentity.executionSelectionDigest)
      .not.toBe(first.executionIdentity.executionSelectionDigest);
    expect(changedMode.executionIdentity.runtimeSelectionDigest)
      .toBe(first.executionIdentity.runtimeSelectionDigest);
    expect(changedPolicy.selection.authorizationSelectionDigest)
      .not.toBe(first.selection.authorizationSelectionDigest);
  });

  it("detects selection and execution digest tampering", () => {
    const result = resolve("smart_confirm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasValidTaskAuthorizationSelection({
      ...result.selection,
      authorizationSelectionDigest:
        "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    })).toBe(false);
    expect(hasValidTaskExecutionSelectionIdentity({
      ...result.executionIdentity,
      runtimeSelectionDigest:
        "sha256:8888888888888888888888888888888888888888888888888888888888888888",
    })).toBe(false);
  });

  it("keeps selection records free from bodies, paths, credentials and handles", () => {
    const result = resolve("smart_confirm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "userInput",
      "localPath",
      "toolArguments",
      "confirmationPayload",
      "credentialRef",
      "accessToken",
      "runtimeHandle",
    ]) expect(serialized).not.toContain(forbidden);
  });
});

describe("DFI-2A.1 task authorization policy Providers", () => {
  it("returns the frozen three-mode MVP snapshot", async () => {
    const provider = new FixedTaskAuthorizationModePolicyProvider();
    const snapshot = await provider.loadSnapshot();
    expect(snapshot.supportedModes).toEqual([
      "manual_review",
      "smart_confirm",
      "task_scoped",
    ]);
    expect(snapshot.legacyDefaultMode).toBe("smart_confirm");
    expect(hasValidTaskAuthorizationModePolicySnapshot(snapshot)).toBe(true);
  });

  it("lets tests replace snapshots without sharing mutable references", async () => {
    const provider = new FakeTaskAuthorizationModePolicyProvider(
      MVP_TASK_AUTHORIZATION_MODE_POLICY,
    );
    const first = await provider.loadSnapshot();
    const replacement = createTaskAuthorizationModePolicySnapshot({
      policyId: "task-authorization-policy.test.manual",
      supportedModes: ["manual_review"],
      legacyDefaultMode: "manual_review",
      createdAt,
    });
    provider.replace(replacement);
    expect(await provider.loadSnapshot()).toEqual(replacement);
    expect(first).toEqual(MVP_TASK_AUTHORIZATION_MODE_POLICY);
  });
});
