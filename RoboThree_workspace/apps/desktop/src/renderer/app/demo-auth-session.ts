import { readonly, ref, type InjectionKey, type Ref } from "vue";
import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

export type DemoAuthSession = Readonly<{
  username: "admin";
  displayName: "管理员";
  sessionKind: "local_demo";
}>;

export type DemoSignInResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

export type DemoAuthSessionStore = {
  readonly session: Readonly<Ref<DemoAuthSession | null>>;
  signIn(username: string, password: string): DemoSignInResult;
  signOut(): void;
  rememberTarget(target: RouteLocationRaw): void;
  consumeTarget(): RouteLocationRaw | null;
};

export const demoAuthSessionKey: InjectionKey<DemoAuthSessionStore> =
  Symbol("RoboThreeDemoAuthSession");

export function createDemoAuthSessionStore(): DemoAuthSessionStore {
  const session = ref<DemoAuthSession | null>(null);
  let pendingTarget: RouteLocationRaw | null = null;

  return {
    session: readonly(session),
    signIn(username, password) {
      if (username !== "admin" || password !== "123456") {
        return { ok: false, message: "账号或密码不正确" };
      }
      session.value = {
        username: "admin",
        displayName: "管理员",
        sessionKind: "local_demo",
      };
      return { ok: true };
    },
    signOut() {
      session.value = null;
      pendingTarget = null;
    },
    rememberTarget(target) {
      pendingTarget = target;
    },
    consumeTarget() {
      const target = pendingTarget;
      pendingTarget = null;
      return target;
    },
  };
}

const safeResourceId = /^[a-z][a-z0-9._:-]{0,159}$/u;

export function safeDemoReturnTarget(
  route: RouteLocationNormalized,
): RouteLocationRaw {
  const name = typeof route.name === "string" ? route.name : "";
  const plainRoutes = new Set<string>([
    "workbench",
    "intelligence",
    "knowledge",
    "settingsModels",
    "settingsPersonalization",
    "settingsMemory",
    "settingsFeedback",
  ]);

  if (plainRoutes.has(name)) return { name };

  if (name === "tasks") {
    const query = selectSafeQuery(route.query, ["sessionId", "taskId"]);
    return { name, ...(Object.keys(query).length > 0 ? { query } : {}) };
  }

  const detailParamByRoute: Readonly<Record<string, string>> = {
    intelligenceRobotDetail: "robotId",
    intelligenceSkillDetail: "skillId",
    intelligenceToolDetail: "toolId",
    knowledgeDetail: "knowledgeId",
  };
  const paramName = detailParamByRoute[name];
  const value = paramName === undefined ? undefined : route.params[paramName];
  if (paramName !== undefined && typeof value === "string" && safeResourceId.test(value)) {
    return { name, params: { [paramName]: value } };
  }

  return { name: "workbench" };
}

function selectSafeQuery(
  query: RouteLocationNormalized["query"],
  allowedKeys: readonly string[],
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = query[key];
    if (typeof value === "string" && safeResourceId.test(value)) safe[key] = value;
  }
  return safe;
}
