import { productionRouteNames } from "../../app/router.js";

export type SettingsSectionKey =
  | "models"
  | "personalization"
  | "memory"
  | "feedback"
  | "identity";

export type SettingsCapabilityState = "available" | "gated";
export type SettingsDataOrigin = "live_projection" | "static_product_copy";

export type SettingsSectionNavItem = {
  key: SettingsSectionKey;
  label: string;
  routeName: string;
  statusLabel: string;
  capabilityState: SettingsCapabilityState;
};

export type SettingsGateField = {
  label: string;
  value: string;
};

export type SettingsCapabilityGateConfig = {
  key: Exclude<SettingsSectionKey, "models">;
  eyebrow: string;
  title: string;
  description: string;
  noticeTitle: string;
  noticeText: string;
  dataOrigin: "static_product_copy";
  capabilityState: "gated";
  capabilityLabel: string;
  runtimeStatusLabel: string;
  fields: readonly SettingsGateField[];
  disabledActions: readonly string[];
  disabledReason: string;
};

export const settingsSections = Object.freeze<readonly SettingsSectionNavItem[]>([
  {
    key: "models",
    label: "模型管理",
    routeName: productionRouteNames.settingsModels,
    statusLabel: "已接入",
    capabilityState: "available",
  },
  {
    key: "personalization",
    label: "个性化",
    routeName: productionRouteNames.settingsPersonalization,
    statusLabel: "待接入",
    capabilityState: "gated",
  },
  {
    key: "memory",
    label: "个人记忆",
    routeName: productionRouteNames.settingsMemory,
    statusLabel: "待接入",
    capabilityState: "gated",
  },
  {
    key: "feedback",
    label: "问题反馈",
    routeName: productionRouteNames.settingsFeedback,
    statusLabel: "待接入",
    capabilityState: "gated",
  },
]);

export const settingsGatePages = Object.freeze<Record<SettingsCapabilityGateConfig["key"], SettingsCapabilityGateConfig>>({
  personalization: {
    key: "personalization",
    eyebrow: "设置",
    title: "个性化",
    description: "配置任务偏好、界面偏好和默认工作方式的页面骨架。",
    noticeTitle: "个性化策略待接入",
    noticeText: "本页只展示未来设置结构，不保存偏好，也不预览真实任务行为。",
    dataOrigin: "static_product_copy",
    capabilityState: "gated",
    capabilityLabel: "功能尚未接入",
    runtimeStatusLabel: "应用运行正常",
    fields: [
      { label: "任务偏好", value: "未来用于配置默认任务表达和确认节奏。" },
      { label: "界面偏好", value: "未来用于配置密度、辅助提示和显示习惯。" },
      { label: "默认工作方式", value: "未来用于配置新任务的默认交互倾向。" },
    ],
    disabledActions: ["保存个性化设置", "恢复默认", "预览效果"],
    disabledReason: "个性化设置与保存功能尚未开放。",
  },
  memory: {
    key: "memory",
    eyebrow: "设置",
    title: "个人记忆",
    description: "查看和管理个人记忆的占位页面。",
    noticeTitle: "个人记忆待接入",
    noticeText: "本页不读取个人记忆，不展示假记忆，也不提供查看、编辑或删除结果。",
    dataOrigin: "static_product_copy",
    capabilityState: "gated",
    capabilityLabel: "功能尚未接入",
    runtimeStatusLabel: "应用运行正常",
    fields: [
      { label: "记忆范围", value: "未来用于说明哪些事实可进入个人记忆。" },
      { label: "审核方式", value: "未来用于控制候选记忆的人工确认策略。" },
      { label: "保留策略", value: "未来用于展示记忆保留和失效规则。" },
    ],
    disabledActions: ["查看记忆", "修改记忆", "删除记忆"],
    disabledReason: "个人记忆、审核和保存能力尚未开放。",
  },
  feedback: {
    key: "feedback",
    eyebrow: "设置",
    title: "问题反馈",
    description: "提交问题和产品反馈的占位页面。",
    noticeTitle: "反馈通道待接入",
    noticeText: "本页不发送反馈，不上传附件，也不声明提交结果。",
    dataOrigin: "static_product_copy",
    capabilityState: "gated",
    capabilityLabel: "功能尚未接入",
    runtimeStatusLabel: "应用运行正常",
    fields: [
      { label: "反馈类型", value: "未来用于区分问题、建议和体验反馈。" },
      { label: "附件", value: "未来用于受控附加截图或日志摘要。" },
      { label: "处理状态", value: "未来用于查看反馈流转状态。" },
    ],
    disabledActions: ["提交反馈", "添加附件", "查看处理进度"],
    disabledReason: "意见反馈的提交与处理功能尚未开放。",
  },
  identity: {
    key: "identity",
    eyebrow: "设置",
    title: "登录与身份",
    description: "查看企业身份和权限状态的占位页面。",
    noticeTitle: "企业身份能力待接入",
    noticeText: "本页不展示身份凭据、会话内部字段或权限声明详情。",
    dataOrigin: "static_product_copy",
    capabilityState: "gated",
    capabilityLabel: "功能尚未接入",
    runtimeStatusLabel: "应用运行正常",
    fields: [
      { label: "企业身份", value: "未来用于展示当前企业账号的安全摘要。" },
      { label: "权限范围", value: "未来用于展示可用模型、工具和知识能力摘要。" },
      { label: "会话状态", value: "未来用于展示登录状态和过期提示。" },
    ],
    disabledActions: ["刷新身份", "重新登录", "退出登录"],
    disabledReason: "企业登录、单点登录和权限管理功能尚未开放。",
  },
});

export function getSettingsGateConfig(
  key: SettingsCapabilityGateConfig["key"],
): SettingsCapabilityGateConfig {
  return settingsGatePages[key];
}
