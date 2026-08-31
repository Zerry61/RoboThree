<template>
  <div class="desktop-shell" :class="{ 'desktop-shell--collapsed': collapsed }">
    <aside class="desktop-shell__sidebar" aria-label="主导航">
      <div class="desktop-shell__brand">
        <div class="desktop-shell__mark" aria-hidden="true">R</div>
        <div v-if="!collapsed" class="desktop-shell__brand-text">
          <strong>RoboThree</strong>
        </div>
      </div>

      <div class="desktop-shell__scroll">
        <nav class="desktop-shell__nav" aria-label="主要功能">
          <RouterLink
            v-for="item in items"
            :key="item.key"
            :to="{ name: item.routeName }"
            class="desktop-shell__nav-item"
            :class="{ 'desktop-shell__nav-item--active': route.meta.navKey === item.key }"
            :aria-current="route.meta.navKey === item.key ? 'page' : undefined"
            :title="collapsed ? item.label : undefined"
            @click="handlePrimaryNavigation(item)"
          >
            <span class="desktop-shell__nav-icon" aria-hidden="true">{{ item.icon }}</span>
            <span v-if="!collapsed" class="desktop-shell__nav-label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <template v-if="!collapsed">
          <section v-if="pinnedTasks.length > 0" class="desktop-shell__section" aria-labelledby="pinned-tasks-title">
            <header>
              <h2 id="pinned-tasks-title">置顶任务</h2>
              <span>本次运行</span>
            </header>
            <button
              v-for="task in pinnedTasks"
              :key="task.taskId"
              type="button"
              class="desktop-shell__task-link"
              @click="void openConversation(task.sessionId, task.taskId)"
            >
              <strong>{{ sessionTitle(task.sessionId) }}</strong>
              <small>{{ taskStatusLabel(task.displayStatus) }}</small>
            </button>
          </section>

          <section v-if="navigation.workspaces.length > 0" class="desktop-shell__section" aria-labelledby="workspace-title">
            <header><h2 id="workspace-title">项目空间</h2></header>
            <button
              v-for="workspace in navigation.workspaces.slice(0, 4)"
              :key="workspace.workspaceGrantId"
              type="button"
              class="desktop-shell__task-link"
              @click="void openWorkspace(workspace.workspaceGrantId)"
            >
              <strong>{{ workspace.displayName }}</strong>
              <small>{{ workspace.accessMode === 'read_write' ? '可读写' : '只读' }}</small>
            </button>
          </section>

          <section class="desktop-shell__section" aria-labelledby="recent-conversations-title">
            <header>
              <h2 id="recent-conversations-title">最近对话</h2>
            </header>
            <div v-if="navigationLoading" class="desktop-shell__empty">正在同步对话…</div>
            <template v-else>
              <div v-for="task in recentConversations" :key="task.sessionId" class="desktop-shell__recent-row">
                <button
                  type="button"
                  class="desktop-shell__task-link"
                  @click="void openConversation(task.sessionId, task.taskId)"
                >
                  <strong>{{ sessionTitle(task.sessionId) }}</strong>
                  <small>{{ formatTime(task.updatedAt) }} · {{ taskStatusLabel(task.displayStatus) }}</small>
                </button>
                <button
                  type="button"
                  class="desktop-shell__pin"
                  :aria-label="isPinned(task.taskId) ? '取消置顶任务' : '置顶任务'"
                  :aria-pressed="isPinned(task.taskId)"
                  @click="togglePinned(task.taskId)"
                >
                  {{ isPinned(task.taskId) ? "★" : "☆" }}
                </button>
              </div>
              <p v-if="recentConversations.length === 0" class="desktop-shell__empty">暂无对话</p>
            </template>
            <p v-if="navigationError" class="desktop-shell__error">{{ navigationError }}</p>
          </section>
        </template>
      </div>

      <div class="desktop-shell__sidebar-footer">
        <R3Tooltip :text="collapsed ? '展开侧栏' : '收起侧栏'">
          <R3IconButton
            :label="collapsed ? '展开侧栏' : '收起侧栏'"
            @click="collapsed = !collapsed"
          >
            {{ collapsed ? ">" : "<" }}
          </R3IconButton>
        </R3Tooltip>
        <div ref="userMenuRoot" class="desktop-shell__user-menu">
          <button
            type="button"
            class="desktop-shell__user-trigger"
            aria-haspopup="menu"
            :aria-label="userDisplayName"
            :aria-expanded="userMenuOpen"
            :title="collapsed ? userDisplayName : undefined"
            @click="userMenuOpen = !userMenuOpen"
          >
            <span class="desktop-shell__avatar" aria-hidden="true">U</span>
            <span v-if="!collapsed" class="desktop-shell__user-label">{{ userDisplayName }}</span>
          </button>
          <div v-if="userMenuOpen" class="desktop-shell__user-popover" role="menu">
            <button type="button" role="menuitem" @click="void openSettings()">设置</button>
            <button v-if="isLocalDemo" type="button" role="menuitem" @click="void signOut()">
              退出登录
            </button>
          </div>
        </div>
      </div>
    </aside>

    <section class="desktop-shell__main">
      <main class="desktop-shell__content" aria-label="主内容" tabindex="-1">
        <slot />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { TaskDisplayStatus } from "@robothree/contracts";
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { PrimaryNavigationItem } from "../../app/navigation.js";
import {
  createDemoAuthSessionStore,
  demoAuthSessionKey,
  type DemoAuthSessionStore,
} from "../../app/demo-auth-session.js";
import { runtimeModeKey, type DesktopRuntimeMode } from "../../app/runtime-mode.js";
import {
  desktopTaskPinStore,
  taskPinStoreKey,
  type TaskPinStore,
} from "../../app/task-pin-store.js";
import {
  notifyWorkbenchNewTaskRequested,
  subscribeShellNavigationChanged,
} from "../../app/shell-navigation-events.js";
import {
  desktopShellNavigationAdapter,
  shellNavigationAdapterKey,
  type ShellNavigationAdapter,
  type ShellNavigationData,
} from "../../adapters/shell-navigation-adapter.js";
import R3IconButton from "../ui/R3IconButton.vue";
import R3Tooltip from "../ui/R3Tooltip.vue";

defineProps<{ items: readonly PrimaryNavigationItem[] }>();

const route = useRoute();
const router = useRouter();
const adapter = inject<ShellNavigationAdapter>(
  shellNavigationAdapterKey,
  desktopShellNavigationAdapter,
);
const taskPins = inject<TaskPinStore>(taskPinStoreKey, desktopTaskPinStore);
const runtimeMode = inject<DesktopRuntimeMode>(runtimeModeKey, "standard");
const demoAuth = inject<DemoAuthSessionStore>(
  demoAuthSessionKey,
  createDemoAuthSessionStore(),
);
const collapsed = ref(false);
const userMenuOpen = ref(false);
const userMenuRoot = ref<HTMLElement>();
const navigationLoading = ref(false);
const navigationError = ref("");
const navigation = reactive<ShellNavigationData>({ workspaces: [], sessions: [], tasks: [] });
let unsubscribeShellNavigationChanged: (() => void) | undefined;

const recentConversations = computed(() => {
  const latestBySession = new Map<string, TaskSummaryProjection>();
  for (const task of [...navigation.tasks]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))) {
    if (!latestBySession.has(task.sessionId)) latestBySession.set(task.sessionId, task);
  }
  return [...latestBySession.values()].slice(0, 8);
});
const pinnedTasks = computed(() => navigation.tasks.filter((task) => taskPins.isPinned(task.taskId)));
const isLocalDemo = computed(() => runtimeMode === "local_demo");
const userDisplayName = computed(() => isLocalDemo.value
  ? `${demoAuth.session.value?.displayName ?? "管理员"} · 本地演示`
  : "本地用户");

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  unsubscribeShellNavigationChanged = subscribeShellNavigationChanged(() => {
    void refreshNavigation();
  });
  if (
    adapter !== desktopShellNavigationAdapter
    || (typeof window !== "undefined" && "robothreeDesktop" in window)
  ) {
    void refreshNavigation();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  unsubscribeShellNavigationChanged?.();
});

watch(() => route.fullPath, () => {
  closeUserMenu();
  void refreshNavigation();
});
watch(collapsed, (next) => {
  if (next) closeUserMenu();
});

async function refreshNavigation(): Promise<void> {
  navigationLoading.value = true;
  try {
    Object.assign(navigation, await adapter.loadNavigation());
    navigationError.value = "";
  } catch (caught) {
    navigationError.value = caught instanceof Error ? caught.message : "任务导航暂时不可用。";
  } finally {
    navigationLoading.value = false;
  }
}

function sessionTitle(sessionId: string): string {
  return navigation.sessions.find((session) => session.sessionId === sessionId)?.title ?? "未命名任务";
}

function isPinned(taskId: string): boolean {
  return taskPins.isPinned(taskId);
}

function togglePinned(taskId: string): void {
  taskPins.toggle(taskId);
}

function closeUserMenu(): void {
  userMenuOpen.value = false;
}

async function signOut(): Promise<void> {
  demoAuth.signOut();
  closeUserMenu();
  await router.replace({ name: "login" });
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!userMenuOpen.value || userMenuRoot.value?.contains(event.target as Node)) return;
  closeUserMenu();
}

function handlePrimaryNavigation(item: PrimaryNavigationItem): void {
  if (item.key === "workbench") notifyWorkbenchNewTaskRequested();
}

async function openSettings(): Promise<void> {
  closeUserMenu();
  await router.push({ name: "settingsModels" });
}

async function openConversation(sessionId: string, taskId: string): Promise<void> {
  await router.push({ name: "workbench", query: { sessionId, taskId } });
}

async function openWorkspace(workspaceGrantId: string): Promise<void> {
  await router.push({ name: "workbench", query: { workspaceGrantId } });
}

function taskStatusLabel(status: TaskDisplayStatus): string {
  const labels: Record<TaskDisplayStatus, string> = {
    preparing: "准备中",
    queued: "排队中",
    running: "进行中",
    waiting_input: "等待输入",
    waiting_confirmation: "等待确认",
    recovering: "恢复中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    timed_out: "已超时",
    manual_attention: "需要处理",
  };
  return labels[status];
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" })
    .format(new Date(timestamp));
}
</script>

<style scoped>
.desktop-shell { height: 100vh; min-height: 0; overflow: hidden; display: grid; grid-template-columns: 248px minmax(0, 1fr); background: var(--r3-color-background); color: var(--r3-color-text); }
.desktop-shell--collapsed { grid-template-columns: var(--r3-sidebar-collapsed) minmax(0, 1fr); }
.desktop-shell__sidebar { min-width: 0; height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; border-right: 1px solid var(--r3-color-border); padding: 12px 10px 10px; background: #fbfcfd; }
.desktop-shell__brand { min-height: 34px; display: flex; align-items: center; gap: 9px; padding: 0 5px; }
.desktop-shell__mark, .desktop-shell__avatar, .desktop-shell__nav-icon { display: inline-grid; place-items: center; flex: 0 0 auto; border-radius: var(--r3-radius-md); font-weight: 750; }
.desktop-shell__mark { width: 28px; height: 28px; border-radius: 7px; background: var(--r3-color-primary); color: #fff; box-shadow: 0 4px 12px rgba(49, 94, 231, 0.2); }
.desktop-shell__brand-text { min-width: 0; display: grid; }
.desktop-shell__brand-text strong { font-size: 14px; letter-spacing: 0; }
.desktop-shell__scroll { min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: 14px; padding-right: 2px; scrollbar-width: thin; }
.desktop-shell__nav { display: grid; gap: 2px; }
.desktop-shell__nav-item { min-height: 36px; display: flex; align-items: center; gap: 9px; border-radius: var(--r3-radius-md); padding: 0 9px; color: var(--r3-color-text-secondary); text-decoration: none; font-size: var(--r3-font-size-sm); }
.desktop-shell__nav-item:hover { background: var(--r3-color-surface-hover); color: var(--r3-color-text); }
.desktop-shell__nav-item--active { background: #e9edf6; color: var(--r3-color-text); font-weight: 650; }
.desktop-shell__nav-item:focus-visible, .desktop-shell__task-link:focus-visible, .desktop-shell__pin:focus-visible, .desktop-shell__refresh:focus-visible, .desktop-shell__user-menu a:focus-visible, .desktop-shell__user-menu button:focus-visible { outline: 2px solid var(--r3-color-primary); outline-offset: 2px; }
.desktop-shell__nav-icon { width: 20px; height: 20px; border-radius: 5px; background: transparent; color: var(--r3-color-text-tertiary); font-size: 11px; }
.desktop-shell__nav-item--active .desktop-shell__nav-icon { background: var(--r3-color-surface); color: var(--r3-color-primary); }
.desktop-shell__section { display: grid; gap: 5px; }
.desktop-shell__section header { min-height: 24px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 6px; }
.desktop-shell__section h2 { margin: 0; color: var(--r3-color-text-tertiary); font-size: 11px; font-weight: 650; }
.desktop-shell__section header span { color: var(--r3-color-text-tertiary); font-size: 10px; }
.desktop-shell__task-link { min-width: 0; width: 100%; display: grid; gap: 1px; border: 0; border-radius: var(--r3-radius-sm); padding: 6px 8px; background: transparent; color: var(--r3-color-text); text-align: left; }
.desktop-shell__task-link:hover { background: var(--r3-color-surface-hover); }
.desktop-shell__task-link strong, .desktop-shell__task-link small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desktop-shell__task-link strong { font-size: 12px; font-weight: 560; }
.desktop-shell__task-link small, .desktop-shell__empty { color: var(--r3-color-text-tertiary); font-size: var(--r3-font-size-xs); }
.desktop-shell__empty, .desktop-shell__error { margin: 0; padding: 6px 8px; }
.desktop-shell__error { color: var(--r3-color-danger); font-size: var(--r3-font-size-xs); }
.desktop-shell__recent-row { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; }
.desktop-shell__pin, .desktop-shell__refresh { border: 0; background: transparent; color: var(--r3-color-text-secondary); }
.desktop-shell__pin { width: 28px; height: 28px; }
.desktop-shell__refresh { padding: 2px 4px; font-size: var(--r3-font-size-xs); }
.desktop-shell__sidebar-footer { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 7px; align-items: center; border-top: 1px solid var(--r3-color-border); padding-top: 9px; }
.desktop-shell__user-menu { min-width: 0; }
.desktop-shell__user-trigger { min-width: 0; width: 100%; display: flex; align-items: center; gap: 8px; border: 0; border-radius: var(--r3-radius-sm); padding: 5px; background: transparent; color: var(--r3-color-text-secondary); cursor: pointer; text-align: left; }
.desktop-shell__user-trigger:hover { background: var(--r3-color-surface-hover); }
.desktop-shell__user-trigger:focus-visible { outline: 2px solid var(--r3-color-primary); outline-offset: 2px; }
.desktop-shell__avatar { width: 28px; height: 28px; border-radius: 50%; background: #e4e9f8; color: var(--r3-color-primary); }
.desktop-shell__user-popover { position: absolute; right: 0; bottom: 44px; z-index: 20; width: 168px; display: grid; gap: 4px; border: 1px solid var(--r3-color-border); border-radius: var(--r3-radius-md); padding: 6px; background: var(--r3-color-surface); box-shadow: var(--r3-shadow-lg); }
.desktop-shell__user-popover a, .desktop-shell__user-popover button { border: 0; border-radius: var(--r3-radius-sm); padding: 8px; background: transparent; color: var(--r3-color-text); text-align: left; text-decoration: none; }
.desktop-shell__user-popover a:hover, .desktop-shell__user-popover button:hover { background: var(--r3-color-surface-hover); }
.desktop-shell__main { min-width: 0; min-height: 0; height: 100vh; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr); }
.desktop-shell__content { min-width: 0; min-height: 0; height: 100%; overflow: auto; }
.desktop-shell--collapsed .desktop-shell__sidebar-footer { grid-template-columns: 1fr; justify-items: center; }
.desktop-shell--collapsed .desktop-shell__user-menu { width: 38px; }
.desktop-shell--collapsed .desktop-shell__user-trigger { width: 38px; height: 38px; padding: 5px; }
.desktop-shell--collapsed .desktop-shell__user-popover { right: auto; bottom: 0; left: calc(100% + 8px); }
@media (max-width: 760px) {
  .desktop-shell { grid-template-columns: var(--r3-sidebar-collapsed) minmax(0, 1fr); }
  .desktop-shell__brand-text, .desktop-shell__section, .desktop-shell__nav-label, .desktop-shell__user-label { display: none; }
  .desktop-shell__sidebar-footer { grid-template-columns: 1fr; justify-items: center; }
  .desktop-shell__user-menu { width: 38px; }
  .desktop-shell__user-trigger { width: 38px; height: 38px; padding: 5px; }
  .desktop-shell__user-popover { right: auto; bottom: 0; left: calc(100% + 8px); }
}
</style>
