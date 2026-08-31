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
    label: "新建任务",
    routeName: "workbench",
    icon: "+",
  },
  {
    key: "intelligence",
    label: "智能中心",
    routeName: "intelligence",
    icon: "◇",
  },
  {
    key: "knowledge",
    label: "知识中心",
    routeName: "knowledge",
    icon: "▤",
  },
] satisfies readonly PrimaryNavigationItem[]);
