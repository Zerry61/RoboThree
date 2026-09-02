import type { SkillDetail, SkillListScope } from
  "@robothree/contracts/skill-lifecycle/v1alpha1";
import { vi } from "vitest";

import type { SkillLifecycleAdapter } from
  "../src/renderer/adapters/skill-lifecycle-adapter.js";

export const skillRevision = `sha256:${"a".repeat(64)}`;
export const skillInstallationRevision = `sha256:${"b".repeat(64)}`;
export const skillSubmissionRevision = `sha256:${"c".repeat(64)}`;
const timestamp = "2026-09-01T00:00:00.000Z";

export function skillDetailFixture(input: Partial<SkillDetail> = {}): SkillDetail {
  return {
    skillId: "skill.weekly-report",
    revision: skillRevision,
    technicalName: "weekly-report",
    displayTitle: "周报整理",
    displayDescription: "整理项目进展、风险和下周计划。",
    sourceKind: "personal_creator",
    availability: "available",
    creatorDisplayName: "本地用户",
    installed: false,
    updatedAt: timestamp,
    safeMarkdown: "# 周报整理\n\n只展示安全技能说明。",
    draftTestFact: {
      draftRevision: skillRevision,
      state: "passed",
      taskId: "task.skill-test",
      testedAt: timestamp,
    },
    ...input,
  };
}

export function marketplaceSkillFixture(input: Partial<SkillDetail> = {}): SkillDetail {
  return skillDetailFixture({
    skillId: "skill.enterprise-slides",
    technicalName: "enterprise-slides",
    displayTitle: "企业演示文稿",
    displayDescription: "根据材料生成企业演示文稿。",
    sourceKind: "admin_upload",
    semanticVersion: "1.0.0",
    packageFacts: {
      packageDigest: skillRevision,
      manifestDigest: skillRevision,
      skillMarkdownDigest: skillRevision,
      fileCount: 3,
      expandedByteCount: 4096,
    },
    draftTestFact: undefined,
    ...input,
  });
}

export function createSkillLifecycleTestAdapter(): SkillLifecycleAdapter & Record<string, ReturnType<typeof vi.fn>> {
  const details = new Map<string, SkillDetail>([
    ["skill.weekly-report", skillDetailFixture()],
    ["skill.enterprise-slides", marketplaceSkillFixture()],
  ]);
  const summariesByScope: Record<SkillListScope, SkillDetail[]> = {
    marketplace: [marketplaceSkillFixture()],
    installed: [marketplaceSkillFixture({
      installed: true,
      installationRevision: skillInstallationRevision,
    })],
    local: [skillDetailFixture({
      skillId: "skill.local-review",
      technicalName: "local-review",
      displayTitle: "本地审阅",
      sourceKind: "local_user_directory",
      creatorDisplayName: undefined,
      draftTestFact: undefined,
    })],
    created: [skillDetailFixture()],
  };
  return {
    getSkillLifecycleCompatibility: vi.fn(async () => ({
      contractVersion: "skill-lifecycle.v1alpha1",
      serviceAvailable: true,
      marketplaceAvailable: true,
      creatorAvailable: true,
      installationAvailable: true,
      testIdentityUsed: false,
      productionIdentityReady: false,
    })),
    listSkills: vi.fn(async ({ scope }: { scope: SkillListScope }) => ({
      contractVersion: "skill-lifecycle.v1alpha1",
      queryRevision: skillRevision,
      scope,
      items: summariesByScope[scope],
    })),
    getSkill: vi.fn(async ({ skillId }: { skillId: string }) =>
      details.get(skillId) ?? skillDetailFixture({ skillId })),
    createSkillDraftWorkspace: vi.fn(async () => ({
      contractVersion: "skill-lifecycle.v1alpha1",
      commandId: "command.skill-create",
      correlationId: "correlation.skill-create",
      skillId: "skill.weekly-report",
      currentRevision: skillRevision,
      state: "draft_created",
      draftId: "draft.skill-weekly-report",
      workspaceGrantId: "workspace.skill-weekly-report",
      displayName: "周报整理",
    })),
    refreshSkillDraft: vi.fn(async () => mutationReceipt("draft_refreshed")),
    startSkillDraftTest: vi.fn(async () => ({
      ...mutationReceipt("test_started"),
      operationId: "operation.skill-test",
    })),
    submitSkillDraft: vi.fn(async () => ({
      ...mutationReceipt("submitted"),
      submissionId: "submission.skill-weekly-report",
      submissionRevision: skillSubmissionRevision,
    })),
    withdrawSkillSubmission: vi.fn(async () => mutationReceipt("withdrawn")),
    installSkillRelease: vi.fn(async () => ({
      ...mutationReceipt("install_accepted"),
      skillId: "skill.enterprise-slides",
      operationId: "operation.skill-install",
    })),
    uninstallSkillRelease: vi.fn(async () => ({
      ...mutationReceipt("uninstall_accepted"),
      skillId: "skill.enterprise-slides",
      operationId: "operation.skill-uninstall",
    })),
    querySkillOperation: vi.fn(async ({ operationId }: { operationId: string }) => ({
      contractVersion: "skill-lifecycle.v1alpha1",
      operationId,
      correlationId: "correlation.skill-operation",
      operationKind: operationId.includes("test") ? "draft_test" as const
        : operationId.includes("uninstall") ? "uninstall" as const : "install" as const,
      state: "succeeded" as const,
      skillId: operationId.includes("test") ? "skill.weekly-report" : "skill.enterprise-slides",
      targetRevision: skillRevision,
      updatedAt: timestamp,
    })),
  } as SkillLifecycleAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

function mutationReceipt(state: "draft_refreshed" | "test_started" | "submitted" | "withdrawn" | "install_accepted" | "uninstall_accepted") {
  return {
    contractVersion: "skill-lifecycle.v1alpha1" as const,
    commandId: `command.${state}`,
    correlationId: `correlation.${state}`,
    skillId: "skill.weekly-report",
    currentRevision: skillRevision,
    state,
  };
}
