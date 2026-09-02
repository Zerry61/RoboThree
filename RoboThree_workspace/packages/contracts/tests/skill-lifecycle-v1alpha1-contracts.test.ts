import { describe, expect, it } from "vitest";

import {
  ADMIN_SKILL_LIFECYCLE_METHODS,
  ApproveSkillSubmissionCommandSchema,
  CreateSkillDraftWorkspaceCommandSchema,
  CreateSkillDraftWorkspaceReceiptSchema,
  DESKTOP_SKILL_LIFECYCLE_METHODS,
  EnterpriseSkillDraftMetadataSchema,
  InstallSkillReleaseCommandSchema,
  ListSkillsQuerySchema,
  QuerySkillOperationSchema,
  SKILL_LIFECYCLE_CONTRACT_VERSION,
  SKILL_LIFECYCLE_PERMISSION,
  SkillDetailSchema,
  SkillDraftTestFactSchema,
  SkillLifecycleCompatibilitySchema,
  SkillLifecycleSafeErrorSchema,
  SkillOperationSchema,
  SkillPackageFactsSchema,
  SubmitSkillDraftCommandSchema,
  SubmitSkillDraftReceiptSchema,
  UploadEnterpriseSkillPackageCommandSchema,
  WithdrawSkillSubmissionCommandSchema,
} from "../src/skill-lifecycle/v1alpha1/index.js";

const commandId = "019f7447-a784-77b2-a716-0000000c0101";
const correlationId = "019f7447-a784-77b2-a716-0000000c0102";
const queryId = "019f7447-a784-77b2-a716-0000000c0103";
const submissionId = "019f7447-a784-77b2-a716-0000000c0104";
const operationId = "019f7447-a784-77b2-a716-0000000c0105";
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const commandMetadata = {
  contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
  commandId,
  correlationId,
};
const queryMetadata = {
  contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
  queryId,
  correlationId,
};

describe("skill lifecycle v1alpha1 contracts", () => {
  it("freezes the exact Desktop and Admin consumer method sets", () => {
    expect(DESKTOP_SKILL_LIFECYCLE_METHODS).toHaveLength(11);
    expect(new Set(DESKTOP_SKILL_LIFECYCLE_METHODS).size).toBe(11);
    expect(DESKTOP_SKILL_LIFECYCLE_METHODS).not.toContain("dispatchSkillCommand");
    expect(ADMIN_SKILL_LIFECYCLE_METHODS).toEqual([
      "listSkillSubmissions",
      "getSkillSubmission",
      "approveSkillSubmission",
      "rejectSkillSubmission",
      "uploadEnterpriseSkillPackage",
      "getEnterpriseSkillDraft",
      "updateEnterpriseSkillDraftMetadata",
      "startEnterpriseSkillDraftTest",
      "queryEnterpriseSkillDraftTest",
      "publishEnterpriseSkillDraft",
    ]);
    expect(SKILL_LIFECYCLE_PERMISSION).toBe("skill.manage");
  });

  it("keeps first-stage creator input minimal and strict", () => {
    const command = {
      ...commandMetadata,
      kind: "create_skill_draft_workspace",
      displayTitle: "演示文稿质量检查",
      displayDescription: "检查演示文稿结构和表达质量",
      primaryFunction: "阅读演示文稿并提出可执行的改进建议",
    } as const;
    expect(CreateSkillDraftWorkspaceCommandSchema.parse(command)).toEqual(command);
    expect(CreateSkillDraftWorkspaceCommandSchema.safeParse({
      ...command,
      workspacePath: "/Users/example/skill",
    }).success).toBe(false);
  });

  it("returns the exact draft workspace identity required by the creator flow", () => {
    const receipt = {
      contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
      commandId,
      correlationId,
      skillId: "skill.presentation-quality",
      currentRevision: digest("a"),
      state: "draft_created",
      draftId: "019f7447-a784-77b2-a716-0000000c0401",
      workspaceGrantId: "workspace:skill-draft-0401",
      displayName: "演示文稿质量检查",
    } as const;
    expect(CreateSkillDraftWorkspaceReceiptSchema.parse(receipt)).toEqual(receipt);
    const { workspaceGrantId: _omitted, ...withoutGrant } = receipt;
    expect(CreateSkillDraftWorkspaceReceiptSchema.safeParse(withoutGrant).success).toBe(false);
  });

  it("freezes the four product scopes and rejects a generic all scope", () => {
    expect(ListSkillsQuerySchema.parse({
      ...queryMetadata,
      kind: "list_skills",
      scope: "marketplace",
    }).limit).toBe(50);
    expect(ListSkillsQuerySchema.safeParse({
      ...queryMetadata,
      kind: "list_skills",
      scope: "all",
    }).success).toBe(false);
  });

  it("requires exact saved revision for test submission and withdrawal identity", () => {
    const submit = {
      ...commandMetadata,
      kind: "submit_skill_draft",
      skillId: "skill.presentation-quality",
      expectedDraftRevision: digest("a"),
      semanticVersion: "1.0.0",
      changeSummary: "首次发布",
      publicationScope: "enterprise",
    } as const;
    expect(SubmitSkillDraftCommandSchema.parse(submit)).toEqual(submit);
    const { expectedDraftRevision: _omitted, ...withoutRevision } = submit;
    expect(SubmitSkillDraftCommandSchema.safeParse(withoutRevision).success).toBe(false);

    expect(WithdrawSkillSubmissionCommandSchema.parse({
      ...commandMetadata,
      kind: "withdraw_skill_submission",
      skillId: "skill.presentation-quality",
      submissionId,
      expectedSubmissionRevision: digest("b"),
    }).submissionId).toBe(submissionId);
  });

  it("persists exact submission identity in submit receipts and skill details", () => {
    const submitReceipt = {
      contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
      commandId,
      correlationId,
      skillId: "skill.presentation-quality",
      currentRevision: digest("a"),
      state: "submitted",
      submissionId,
      submissionRevision: digest("b"),
    } as const;
    expect(SubmitSkillDraftReceiptSchema.parse(submitReceipt)).toEqual(submitReceipt);
    const { submissionRevision: _omitted, ...withoutRevision } = submitReceipt;
    expect(SubmitSkillDraftReceiptSchema.safeParse(withoutRevision).success).toBe(false);

    const detail = skillDetailFixture({
      submission: {
        submissionId,
        submissionRevision: digest("b"),
        state: "pending_review",
      },
    });
    expect(SkillDetailSchema.parse(detail).submission?.submissionRevision).toBe(digest("b"));
  });

  it("requires exact installation identity for every installed skill projection", () => {
    expect(SkillDetailSchema.parse(skillDetailFixture({
      installed: true,
      installationRevision: digest("c"),
    })).installationRevision).toBe(digest("c"));
    expect(SkillDetailSchema.safeParse(skillDetailFixture({ installed: true })).success)
      .toBe(false);
    expect(SkillDetailSchema.safeParse(skillDetailFixture({
      installed: false,
      installationRevision: digest("c"),
    })).success).toBe(false);
  });

  it("keeps review and installation concurrency explicit", () => {
    expect(ApproveSkillSubmissionCommandSchema.parse({
      ...commandMetadata,
      kind: "approve_skill_submission",
      submissionId,
      expectedSubmissionRevision: digest("c"),
    }).expectedSubmissionRevision).toBe(digest("c"));

    const install = {
      ...commandMetadata,
      kind: "install_skill_release",
      skillId: "skill.presentation-quality",
      releaseRevision: digest("d"),
      packageDigest: digest("e"),
      mode: "replace_with_exact_release",
    } as const;
    expect(InstallSkillReleaseCommandSchema.parse(install)).toEqual(install);
    expect(InstallSkillReleaseCommandSchema.safeParse({
      ...install,
      mode: "overwrite_anything",
    }).success).toBe(false);
  });

  it("keeps upload bytes outside strict multipart metadata", () => {
    const upload = {
      ...commandMetadata,
      kind: "upload_enterprise_skill_package",
      upload: {
        archiveFileName: "presentation-quality.rar",
        archiveFormat: "rar",
        mediaType: "application/vnd.rar",
        byteLength: 1024,
        archiveDigest: digest("f"),
      },
    } as const;
    expect(UploadEnterpriseSkillPackageCommandSchema.parse(upload)).toEqual(upload);
    expect(UploadEnterpriseSkillPackageCommandSchema.safeParse({
      ...upload,
      upload: { ...upload.upload, contentBase64: "forbidden" },
    }).success).toBe(false);
    expect(UploadEnterpriseSkillPackageCommandSchema.safeParse({
      ...upload,
      upload: { ...upload.upload, byteLength: 200 * 1024 * 1024 + 1 },
    }).success).toBe(false);
  });

  it("keeps package and safe Markdown projections bounded and path-free", () => {
    const packageFacts = {
      packageDigest: digest("1"),
      manifestDigest: digest("2"),
      skillMarkdownDigest: digest("3"),
      fileCount: 2,
      expandedByteCount: 4096,
    };
    expect(SkillPackageFactsSchema.parse(packageFacts)).toEqual(packageFacts);
    const detail = {
      skillId: "skill.presentation-quality",
      revision: digest("4"),
      technicalName: "presentation-quality",
      displayTitle: "演示文稿质量检查",
      displayDescription: "检查演示文稿结构和表达质量",
      sourceKind: "admin_upload",
      availability: "available",
      semanticVersion: "1.0.0",
      installed: false,
      updatedAt: "2026-09-01T08:00:00.000Z",
      packageFacts,
      safeMarkdown: "# 使用说明",
    } as const;
    expect(SkillDetailSchema.parse(detail)).toEqual(detail);
    expect(SkillDetailSchema.safeParse({ ...detail, absolutePath: "/tmp/skill" }).success)
      .toBe(false);
  });

  it("keeps test and operation facts content-free", () => {
    const testFact = {
      draftRevision: digest("5"),
      state: "passed",
      taskId: "task:019f7447-a784-77b2-a716-0000000c0201",
      testedAt: "2026-09-01T08:00:00.000Z",
    } as const;
    expect(SkillDraftTestFactSchema.parse(testFact)).toEqual(testFact);
    expect(SkillDraftTestFactSchema.safeParse({ ...testFact, output: "private output" }).success)
      .toBe(false);

    const operation = {
      contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
      operationId,
      correlationId,
      operationKind: "install",
      state: "succeeded",
      skillId: "skill.presentation-quality",
      targetRevision: digest("6"),
      updatedAt: "2026-09-01T08:00:00.000Z",
    } as const;
    expect(SkillOperationSchema.parse(operation)).toEqual(operation);
    expect(QuerySkillOperationSchema.parse({
      ...queryMetadata,
      kind: "query_skill_operation",
      operationId,
    }).operationId).toBe(operationId);
  });

  it("keeps enterprise metadata editable without making package facts editable", () => {
    expect(EnterpriseSkillDraftMetadataSchema.parse({
      displayTitle: "演示文稿质量检查",
      displayDescription: "检查演示文稿结构和表达质量",
      semanticVersion: "1.0.0",
      usageScope: "restricted",
      allowedSubjectIds: ["019f7447-a784-77b2-a716-0000000c0301"],
    }).usageScope).toBe("restricted");
    expect(EnterpriseSkillDraftMetadataSchema.safeParse({
      displayTitle: "演示文稿质量检查",
      displayDescription: "检查演示文稿结构和表达质量",
      semanticVersion: "1.0.0",
      usageScope: "enterprise_all",
      allowedSubjectIds: ["019f7447-a784-77b2-a716-0000000c0301"],
    }).success).toBe(false);
  });

  it("keeps compatibility and errors safe and exact", () => {
    expect(SkillLifecycleCompatibilitySchema.parse({
      contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
      serviceAvailable: true,
      marketplaceAvailable: true,
      creatorAvailable: true,
      installationAvailable: true,
      testIdentityUsed: true,
      productionIdentityReady: false,
    }).productionIdentityReady).toBe(false);
    expect(SkillLifecycleSafeErrorSchema.parse({
      contractVersion: SKILL_LIFECYCLE_CONTRACT_VERSION,
      errorCode: "skilllifecycle.active_task_lock",
      safeSummary: "该技能仍被运行中的任务使用，暂时无法卸载。",
      correlationId,
      retryable: false,
    }).errorCode).toBe("skilllifecycle.active_task_lock");
  });

  it("is importable through the exact package subpath", async () => {
    const module = await import("@robothree/contracts/skill-lifecycle/v1alpha1");
    expect(module.SKILL_LIFECYCLE_CONTRACT_VERSION)
      .toBe(SKILL_LIFECYCLE_CONTRACT_VERSION);
    expect(module.DESKTOP_SKILL_LIFECYCLE_METHODS).toHaveLength(11);
  });
});

function skillDetailFixture(overrides: Record<string, unknown> = {}) {
  return {
    skillId: "skill.presentation-quality",
    revision: digest("4"),
    technicalName: "presentation-quality",
    displayTitle: "演示文稿质量检查",
    displayDescription: "检查演示文稿结构和表达质量",
    sourceKind: "personal_creator",
    availability: "available",
    installed: false,
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
