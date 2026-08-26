export type RobotAvatarSource = "system" | "preset" | "upload";
export type RobotCapabilityKey = "model" | "skills" | "tools" | "knowledge";
export type SkillCreateAttemptStatus = "idle" | "failed";
export type SkillDraftTestState = "untested" | "testing" | "passed" | "failed" | "stale";

export type RobotAvatarState = {
  source: RobotAvatarSource;
  label: string;
  previewUrl?: string;
};

export type RobotCapabilityState = {
  enabled: boolean;
  selectedIds: readonly string[];
};

export type RobotDraftState = {
  avatar: RobotAvatarState;
  name: string;
  tags: string;
  intro: string;
  behaviorRules: string;
  capabilities: Record<RobotCapabilityKey, RobotCapabilityState>;
  uploadError: string;
};

export type RobotDraftValidation = {
  name?: string;
  intro?: string;
};

export type SkillCreatorFormState = {
  name: string;
  description: string;
  capabilities: string;
  attemptStatus: SkillCreateAttemptStatus;
};

export type SkillCreatorValidation = {
  name?: string;
  description?: string;
  capabilities?: string;
};

export type SkillCreatorConversation = {
  assistantName: string;
  firstUserMessage: string;
  draftFiles: readonly string[];
};

export type SkillDraftDetailState = {
  name: string;
  summary: string;
  technicalName: string;
  testState: SkillDraftTestState;
  lastTestRevision: string | undefined;
  currentRevision: string;
};

const systemAvatar: RobotAvatarState = Object.freeze({
  source: "system",
  label: "默认",
});

const fallbackRobotAvatarPreset = Object.freeze({ id: "navigator", label: "N" });

export const robotAvatarPresets = Object.freeze([
  fallbackRobotAvatarPreset,
  { id: "analyst", label: "A" },
  { id: "builder", label: "B" },
  { id: "writer", label: "W" },
]);

export const robotCapabilityLabels: Record<RobotCapabilityKey, string> = Object.freeze({
  model: "模型",
  skills: "技能",
  tools: "工具",
  knowledge: "知识",
});

export const skillDraftTestLabels: Record<SkillDraftTestState, string> = Object.freeze({
  untested: "未测试",
  testing: "测试中",
  passed: "测试通过",
  failed: "测试失败",
  stale: "旧结果失效",
});

export function createDefaultRobotDraft(): RobotDraftState {
  return {
    avatar: { ...systemAvatar },
    name: "",
    tags: "",
    intro: "",
    behaviorRules: "",
    capabilities: {
      model: { enabled: false, selectedIds: ["model.default"] },
      skills: { enabled: false, selectedIds: ["skill.document.review"] },
      tools: { enabled: false, selectedIds: ["tool.document.pdf.extract_text"] },
      knowledge: { enabled: false, selectedIds: ["knowledge.local.workspace"] },
    },
    uploadError: "",
  };
}

export function selectPresetAvatar(
  draft: RobotDraftState,
  presetId: string,
): RobotDraftState {
  const preset = robotAvatarPresets.find((candidate) => candidate.id === presetId)
    ?? fallbackRobotAvatarPreset;
  return {
    ...draft,
    avatar: {
      source: "preset",
      label: preset.label,
    },
    uploadError: "",
  };
}

export function selectSystemAvatar(draft: RobotDraftState): RobotDraftState {
  return {
    ...draft,
    avatar: { ...systemAvatar },
    uploadError: "",
  };
}

export function setUploadedAvatarPreview(
  draft: RobotDraftState,
  fileName: string,
  previewUrl: string,
): RobotDraftState {
  return {
    ...draft,
    avatar: {
      source: "upload",
      label: initialsFromFileName(fileName),
      previewUrl,
    },
    uploadError: "",
  };
}

export function setRobotAvatarUploadError(
  draft: RobotDraftState,
  message: string,
): RobotDraftState {
  return {
    ...draft,
    uploadError: message,
  };
}

export function clearUploadedAvatar(draft: RobotDraftState): RobotDraftState {
  if (draft.avatar.source !== "upload") return draft;
  return {
    ...draft,
    avatar: { ...systemAvatar },
    uploadError: "",
  };
}

export function toggleRobotCapability(
  draft: RobotDraftState,
  key: RobotCapabilityKey,
): RobotDraftState {
  return {
    ...draft,
    capabilities: {
      ...draft.capabilities,
      [key]: {
        ...draft.capabilities[key],
        enabled: !draft.capabilities[key].enabled,
      },
    },
  };
}

export function validateRobotDraft(draft: RobotDraftState): RobotDraftValidation {
  const errors: RobotDraftValidation = {};
  if (draft.name.trim() === "") errors.name = "请输入机器人名称";
  if (draft.intro.trim() === "") errors.intro = "请输入机器人介绍";
  return errors;
}

export function validateSkillCreatorForm(
  form: SkillCreatorFormState,
): SkillCreatorValidation {
  const errors: SkillCreatorValidation = {};
  if (form.name.trim() === "") errors.name = "请输入技能名称";
  if (form.description.trim() === "") errors.description = "请输入技能说明";
  if (form.capabilities.trim() === "") errors.capabilities = "请输入希望技能完成的任务";
  return errors;
}

export function hasValidationErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

export function buildSkillCreatorConversation(
  form: SkillCreatorFormState,
): SkillCreatorConversation {
  const name = form.name.trim();
  const description = form.description.trim();
  const capabilities = form.capabilities.trim();
  return {
    assistantName: "技能创建助手",
    firstUserMessage: `请创建技能「${name}」。目标：${description}。能力要求：${capabilities}。`,
    draftFiles: ["SKILL.md", "references/README.md", "scripts/"],
  };
}

export function createDefaultSkillDraftDetail(): SkillDraftDetailState {
  return {
    name: "我的文档整理技能",
    summary: "将本地文档整理为结构化摘要和行动项。",
    technicalName: "local.document.organizer",
    testState: "untested",
    lastTestRevision: undefined,
    currentRevision: "draft-1",
  };
}

export function completeSkillDraftTest(
  draft: SkillDraftDetailState,
  passed: boolean,
): SkillDraftDetailState {
  return {
    ...draft,
    testState: passed ? "passed" : "failed",
    lastTestRevision: draft.currentRevision,
  };
}

export function markSkillDraftChanged(
  draft: SkillDraftDetailState,
): SkillDraftDetailState {
  const nextRevision = nextDraftRevision(draft.currentRevision);
  return {
    ...draft,
    currentRevision: nextRevision,
    testState: draft.lastTestRevision === undefined ? draft.testState : "stale",
  };
}

function initialsFromFileName(fileName: string): string {
  const baseName = fileName.trim().split(/[/.]/u).find((part) => part.length > 0) ?? "U";
  return baseName.slice(0, 1).toUpperCase();
}

function nextDraftRevision(revision: string): string {
  const match = /^draft-(\d+)$/u.exec(revision);
  if (match === null) return "draft-2";
  return `draft-${Number(match[1]) + 1}`;
}
