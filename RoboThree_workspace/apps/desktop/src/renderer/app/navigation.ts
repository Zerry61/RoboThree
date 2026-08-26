export type PrimaryNavigationKey =
  | "workbench"
  | "tasks"
  | "intelligence"
  | "knowledge"
  | "settings";

export type PrimaryNavigationItem = {
  key: PrimaryNavigationKey;
  label: string;
  routeName: string;
  icon: string;
};

export const primaryNavigationItems = Object.freeze([
  {
    key: "workbench",
    label: "工作台",
    routeName: "workbench",
    icon: "W",
  },
  {
    key: "tasks",
    label: "任务",
    routeName: "tasks",
    icon: "T",
  },
  {
    key: "intelligence",
    label: "智能中心",
    routeName: "intelligence",
    icon: "I",
  },
  {
    key: "knowledge",
    label: "知识中心",
    routeName: "knowledge",
    icon: "K",
  },
  {
    key: "settings",
    label: "设置",
    routeName: "settings",
    icon: "S",
  },
] satisfies readonly PrimaryNavigationItem[]);
