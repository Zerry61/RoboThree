import { describe, expect, it } from "vitest";

import {
  AGENT_LIFECYCLE_CONTRACT_VERSION,
  AgentLifecycleSafeErrorSchema,
  BeginRobotDraftTestCommandSchema,
  CompleteRobotDraftTestCommandSchema,
  CreateRobotDraftCommandSchema,
  PublishedRobotReleasePageSchema,
  RobotAvatarSchema,
  RobotDraftMaterialSchema,
  RobotDraftTestFactSchema,
  RobotLifecycleMutationReceiptSchema,
  SubmitRobotDraftCommandSchema,
  UpdateRobotDraftCommandSchema,
} from "../src/agent-lifecycle/v1alpha1/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const id = "123e4567-e89b-42d3-a456-426614174000";
const sessionId = "session:123e4567-e89b-42d3-a456-426614174000";
const taskId = "task:123e4567-e89b-42d3-a456-426614174000";

function material() {
  return {
    robotId: "agent.contract-review",
    name: "合同审阅助手",
    avatar: { source: "system" as const, assetId: "robot-avatar.default" as const },
    tags: ["合同"],
    modelRestriction: { enabled: false, selectedReferences: [] },
    skillRestriction: { enabled: true, selectedReferences: [] },
    toolRestriction: { enabled: true, selectedReferences: [] },
    knowledgeRestriction: { enabled: true, selectedReferences: [] },
  };
}

describe("agent lifecycle v1alpha1 contracts", () => {
  it("accepts a name-only strict draft with explicit empty restrictions", () => {
    expect(RobotDraftMaterialSchema.parse(material())).toEqual(material());
    expect(RobotDraftMaterialSchema.safeParse({ ...material(), unknown: true }).success).toBe(false);
  });

  it("rejects empty names and non-agent IDs", () => {
    expect(RobotDraftMaterialSchema.safeParse({ ...material(), name: "" }).success).toBe(false);
    expect(RobotDraftMaterialSchema.safeParse({ ...material(), robotId: "robot.contract" }).success).toBe(false);
  });

  it("keeps create and update commands exact", () => {
    const metadata = { contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION, commandId: id, correlationId: id };
    expect(CreateRobotDraftCommandSchema.safeParse({ ...metadata, kind: "create_robot_draft", material: material() }).success).toBe(true);
    expect(UpdateRobotDraftCommandSchema.safeParse({ ...metadata, kind: "update_robot_draft", robotId: "agent.other", expectedDraftRevision: digest, material: material() }).success).toBe(false);
  });

  it("requires a valid semantic version and exact saved revision for submit", () => {
    const base = {
      contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION,
      commandId: id,
      correlationId: id,
      kind: "submit_robot_draft",
      robotId: "agent.contract-review",
      expectedDraftRevision: digest,
      semanticVersion: "1.0.0",
      changeSummary: "首次发布",
      publicationScope: "enterprise",
    };
    expect(SubmitRobotDraftCommandSchema.safeParse(base).success).toBe(true);
    expect(SubmitRobotDraftCommandSchema.safeParse({ ...base, semanticVersion: "draft" }).success).toBe(false);
  });

  it("validates terminal test facts without carrying test content", () => {
    expect(RobotDraftTestFactSchema.safeParse({ draftRevision: digest, state: "passed", taskId, testedAt: "2026-08-30T12:00:00.000Z" }).success).toBe(true);
    expect(RobotDraftTestFactSchema.safeParse({ draftRevision: digest, state: "failed", taskId, testedAt: "2026-08-30T12:00:00.000Z" }).success).toBe(false);
    expect(RobotDraftTestFactSchema.safeParse({ draftRevision: digest, state: "passed", taskId, testedAt: "2026-08-30T12:00:00.000Z", output: "secret" }).success).toBe(false);
  });

  it("keeps Core-private test callbacks content-free and exact", () => {
    const metadata = { contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION, commandId: id, correlationId: id };
    const begin = {
      ...metadata,
      kind: "begin_robot_draft_test",
      robotId: "agent.contract-review",
      expectedDraftRevision: digest,
      taskId,
    };
    expect(BeginRobotDraftTestCommandSchema.safeParse(begin).success).toBe(true);
    expect(BeginRobotDraftTestCommandSchema.safeParse({ ...begin, testInput: "sensitive" }).success).toBe(false);
    expect(CompleteRobotDraftTestCommandSchema.safeParse({
      ...metadata,
      kind: "complete_robot_draft_test",
      robotId: "agent.contract-review",
      expectedDraftRevision: digest,
      taskId,
      result: "failed",
      safeReason: "任务未通过",
    }).success).toBe(true);
  });

  it("projects an exact test task location only on test_started receipts", () => {
    const receipt = {
      commandId: id,
      correlationId: id,
      robotId: "agent.contract-review",
      currentRevision: digest,
      state: "test_started",
      sessionId,
      taskId,
    };
    expect(RobotLifecycleMutationReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(RobotLifecycleMutationReceiptSchema.safeParse({
      ...receipt,
      state: "draft_saved",
    }).success).toBe(false);
    expect(RobotLifecycleMutationReceiptSchema.safeParse({
      ...receipt,
      taskId: undefined,
    }).success).toBe(false);
  });

  it("keeps the published release page strict", () => {
    expect(PublishedRobotReleasePageSchema.safeParse({
      contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION,
      queryRevision: digest,
      items: [],
    }).success).toBe(true);
    expect(PublishedRobotReleasePageSchema.safeParse({
      contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION,
      queryRevision: digest,
      items: [],
      current: "latest",
    }).success).toBe(false);
  });

  it("accepts only safe avatar variants", () => {
    expect(RobotAvatarSchema.safeParse({ source: "preset", assetId: "robot-avatar.blue" }).success).toBe(true);
    expect(RobotAvatarSchema.safeParse({ source: "uploaded", assetId: "robot-avatar.uploaded.a", contentDigest: digest }).success).toBe(true);
    expect(RobotAvatarSchema.safeParse({ source: "uploaded", assetId: "robot-avatar.uploaded.a", contentDigest: digest, path: "/tmp/a.png" }).success).toBe(false);
  });

  it("exposes reserved-ID as a typed safe error", () => {
    expect(AgentLifecycleSafeErrorSchema.parse({
      contractVersion: AGENT_LIFECYCLE_CONTRACT_VERSION,
      errorCode: "agentlifecycle.robot_id_reserved",
      safeSummary: "该机器人标识不可使用",
      correlationId: id,
    }).errorCode).toBe("agentlifecycle.robot_id_reserved");
  });

  it("is importable through the exact workspace subpath", async () => {
    const module = await import("@robothree/contracts/agent-lifecycle/v1alpha1");
    expect(module.AGENT_LIFECYCLE_CONTRACT_VERSION).toBe(AGENT_LIFECYCLE_CONTRACT_VERSION);
  });
});
