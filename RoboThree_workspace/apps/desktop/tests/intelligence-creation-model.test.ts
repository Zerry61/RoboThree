import { describe, expect, it } from "vitest";

import {
  buildSkillCreatorConversation,
  clearUploadedAvatar,
  completeSkillDraftTest,
  createDefaultRobotDraft,
  createDefaultSkillDraftDetail,
  hasValidationErrors,
  markSkillDraftChanged,
  selectPresetAvatar,
  selectSystemAvatar,
  setUploadedAvatarPreview,
  toggleRobotCapability,
  validateRobotDraft,
  validateSkillCreatorForm,
} from "../src/renderer/pages/intelligence/intelligence-creation-model.js";

describe("DFE-4B intelligence creation model", () => {
  it("keeps robot capabilities empty until the user explicitly selects resources", () => {
    const draft = createDefaultRobotDraft();

    expect(Object.values(draft.capabilities).every((capability) => !capability.enabled)).toBe(true);
    expect(draft.capabilities.skills.selectedIds).toEqual([]);

    const enabled = toggleRobotCapability(draft, "skills");
    const disabled = toggleRobotCapability(enabled, "skills");

    expect(enabled.capabilities.skills.enabled).toBe(true);
    expect(disabled.capabilities.skills.enabled).toBe(false);
    expect(disabled.capabilities.skills.selectedIds).toEqual([]);
  });

  it("only removes uploaded avatars and keeps other draft fields intact", () => {
    const base = {
      ...createDefaultRobotDraft(),
      name: "合同审阅助手",
    };
    const preset = selectPresetAvatar(base, "analyst");
    const uploaded = setUploadedAvatarPreview(preset, "avatar.png", "data:image/png;base64,AA==");

    expect(clearUploadedAvatar(preset)).toBe(preset);
    expect(clearUploadedAvatar(uploaded).avatar.source).toBe("system");
    expect(clearUploadedAvatar(uploaded).name).toBe("合同审阅助手");
    expect(selectSystemAvatar(preset).name).toBe("合同审阅助手");
  });

  it("validates robot and skill creation drafts without adding hidden backend fields", () => {
    expect(validateRobotDraft(createDefaultRobotDraft())).toEqual({
      name: "请输入机器人名称",
      intro: "请输入机器人简介",
    });
    expect(hasValidationErrors(validateSkillCreatorForm({
      name: "",
      description: "",
      capabilities: "",
      attemptStatus: "idle",
    }))).toBe(true);

    const conversation = buildSkillCreatorConversation({
      name: "周报整理技能",
      description: "整理项目周报",
      capabilities: "提取进展、风险和下周计划",
      attemptStatus: "idle",
    });

    expect(conversation.assistantName).toBe("技能创建助手");
    expect(conversation.firstUserMessage).toContain("周报整理技能");
    expect(conversation.draftFiles).toEqual([]);
    expect(JSON.stringify(conversation)).not.toMatch(/workspaceRoot|rootRealPath|submitTurn/u);
  });

  it("marks previous skill test results stale after the draft changes", () => {
    const draft = completeSkillDraftTest(createDefaultSkillDraftDetail(), true);
    const changed = markSkillDraftChanged(draft);

    expect(draft.testState).toBe("passed");
    expect(changed.testState).toBe("stale");
    expect(changed.currentRevision).toBe("draft-2");
  });
});
