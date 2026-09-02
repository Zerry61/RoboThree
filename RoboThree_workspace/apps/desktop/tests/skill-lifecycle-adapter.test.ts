import type { DesktopSkillLifecycleApiV1Alpha1 } from
  "@robothree/contracts/skill-lifecycle/v1alpha1";
import { describe, expect, it, vi } from "vitest";

import {
  createSkillLifecycleAdapter,
  unavailableSkillLifecycleAdapter,
} from "../src/renderer/adapters/skill-lifecycle-adapter.js";
import {
  createSkillLifecycleTestAdapter,
  skillRevision,
  skillSubmissionRevision,
} from "./skill-lifecycle-test-fixtures.js";

describe("RSL-2 Desktop Skill lifecycle adapter", () => {
  it("adds only frozen metadata and keeps exact operation identities", async () => {
    const implementation = createSkillLifecycleTestAdapter();
    const api = {
      getSkillLifecycleCompatibility: vi.fn(implementation.getSkillLifecycleCompatibility),
      listSkills: vi.fn(implementation.listSkills),
      getSkill: vi.fn(implementation.getSkill),
      createSkillDraftWorkspace: vi.fn(implementation.createSkillDraftWorkspace),
      refreshSkillDraft: vi.fn(implementation.refreshSkillDraft),
      startSkillDraftTest: vi.fn(implementation.startSkillDraftTest),
      submitSkillDraft: vi.fn(implementation.submitSkillDraft),
      withdrawSkillSubmission: vi.fn(implementation.withdrawSkillSubmission),
      installSkillRelease: vi.fn(implementation.installSkillRelease),
      uninstallSkillRelease: vi.fn(implementation.uninstallSkillRelease),
      querySkillOperation: vi.fn(implementation.querySkillOperation),
    } as unknown as DesktopSkillLifecycleApiV1Alpha1 & Record<string, ReturnType<typeof vi.fn>>;
    const adapter = createSkillLifecycleAdapter(api);

    await adapter.listSkills({ scope: "marketplace" });
    expect(api.listSkills).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills",
      scope: "marketplace",
      limit: 40,
      queryId: expect.any(String),
      correlationId: expect.any(String),
    }));
    expect(api.listSkills.mock.calls[0]?.[0]).not.toHaveProperty("workspaceRoot");

    await adapter.submitSkillDraft({
      skillId: "skill.weekly-report",
      expectedDraftRevision: skillRevision,
      semanticVersion: "1.0.0",
      changeSummary: "首次发布",
    });
    expect(api.submitSkillDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: "submit_skill_draft",
      publicationScope: "enterprise",
      expectedDraftRevision: skillRevision,
    }));

    await adapter.withdrawSkillSubmission({
      skillId: "skill.weekly-report",
      submissionId: "submission.skill-weekly-report",
      expectedSubmissionRevision: skillSubmissionRevision,
    });
    expect(api.withdrawSkillSubmission).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: "submission.skill-weekly-report",
      expectedSubmissionRevision: skillSubmissionRevision,
    }));
  });

  it("is explicitly unavailable when the real Preload API is absent", async () => {
    await expect(unavailableSkillLifecycleAdapter.getSkillLifecycleCompatibility()).resolves.toMatchObject({
      serviceAvailable: false,
      marketplaceAvailable: false,
      creatorAvailable: false,
      installationAvailable: false,
    });
    await expect(unavailableSkillLifecycleAdapter.listSkills({ scope: "created" }))
      .rejects.toMatchObject({
        name: "SkillLifecycleAdapterError",
        code: "skilllifecycle.service_unavailable",
      });
  });

  it("preserves typed safe errors without exposing raw exceptions", async () => {
    const implementation = createSkillLifecycleTestAdapter();
    implementation.getSkill.mockRejectedValueOnce({
      contractVersion: "skill-lifecycle.v1alpha1",
      errorCode: "skilllifecycle.not_found",
      safeSummary: "Not found.",
      correlationId: "00000000-0000-4000-8000-000000000404",
      retryable: false,
    });
    const adapter = createSkillLifecycleAdapter(implementation as unknown as DesktopSkillLifecycleApiV1Alpha1);

    await expect(adapter.getSkill({ skillId: "skill.missing" })).rejects.toEqual(
      expect.objectContaining({
        code: "skilllifecycle.not_found",
        retryable: false,
        safeSummary: "Not found.",
      }),
    );
  });
});
