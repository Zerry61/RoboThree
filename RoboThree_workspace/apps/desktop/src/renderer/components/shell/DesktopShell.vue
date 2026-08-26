<template>
  <div class="desktop-shell" :class="{ 'desktop-shell--collapsed': collapsed }">
    <aside class="desktop-shell__sidebar" aria-label="主导航">
      <div class="desktop-shell__brand">
        <div class="desktop-shell__mark" aria-hidden="true">R3</div>
        <div v-if="!collapsed" class="desktop-shell__brand-text">
          <strong>RoboThree</strong>
          <span>Desktop</span>
        </div>
      </div>

      <nav class="desktop-shell__nav">
        <RouterLink
          v-for="item in items"
          :key="item.key"
          v-slot="{ href, navigate, isActive }"
          :to="{ name: item.routeName }"
          custom
        >
          <a
            class="desktop-shell__nav-item"
            :class="{ 'desktop-shell__nav-item--active': isActive || route.meta.navKey === item.key }"
            :href="href"
            :aria-current="isActive || route.meta.navKey === item.key ? 'page' : undefined"
            :title="collapsed ? item.label : undefined"
            @click="navigate"
          >
            <span class="desktop-shell__nav-icon" aria-hidden="true">{{ item.icon }}</span>
            <span v-if="!collapsed" class="desktop-shell__nav-label">{{ item.label }}</span>
          </a>
        </RouterLink>
      </nav>

      <div class="desktop-shell__sidebar-footer">
        <R3Tooltip :text="collapsed ? '展开侧栏' : '收起侧栏'">
          <R3IconButton
            :label="collapsed ? '展开侧栏' : '收起侧栏'"
            @click="collapsed = !collapsed"
          >
            {{ collapsed ? ">" : "<" }}
          </R3IconButton>
        </R3Tooltip>
        <div v-if="!collapsed" class="desktop-shell__user">
          <span class="desktop-shell__avatar" aria-hidden="true">U</span>
          <span>本地用户</span>
        </div>
      </div>
    </aside>

    <section class="desktop-shell__main">
      <header class="desktop-shell__topbar">
        <div>
          <p class="desktop-shell__eyebrow">RoboThree Desktop</p>
          <h1 class="desktop-shell__title">{{ pageTitle }}</h1>
        </div>
        <R3StatusBadge :tone="runtimeTone">{{ runtimeLabel }}</R3StatusBadge>
      </header>
      <main class="desktop-shell__content" aria-label="主内容" tabindex="-1">
        <slot />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import type { PrimaryNavigationItem } from "../../app/navigation.js";
import R3IconButton from "../ui/R3IconButton.vue";
import R3StatusBadge from "../ui/R3StatusBadge.vue";
import R3Tooltip from "../ui/R3Tooltip.vue";

defineProps<{
  items: readonly PrimaryNavigationItem[];
}>();

const route = useRoute();
const collapsed = ref(false);

const pageTitle = computed(() => {
  const title = route.meta.title;
  return typeof title === "string" ? title : "工作台";
});

const runtimeLabel = computed(() => {
  const status = route.meta.runtimeStatus;
  return typeof status === "string" ? status : "Ready";
});

const runtimeTone = computed(() => {
  if (runtimeLabel.value === "Ready") return "success";
  if (runtimeLabel.value === "Unavailable") return "warning";
  return "neutral";
});
</script>

<style scoped>
.desktop-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--r3-sidebar-expanded) minmax(0, 1fr);
  background: var(--r3-color-background);
  color: var(--r3-color-text);
}

.desktop-shell--collapsed {
  grid-template-columns: var(--r3-sidebar-collapsed) minmax(0, 1fr);
}

.desktop-shell__sidebar {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 18px;
  border-right: 1px solid var(--r3-color-border);
  padding: 18px 12px;
  background: var(--r3-color-surface);
}

.desktop-shell__brand {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
}

.desktop-shell__mark,
.desktop-shell__avatar,
.desktop-shell__nav-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: var(--r3-radius-md);
  font-weight: 750;
}

.desktop-shell__mark {
  width: 36px;
  height: 36px;
  background: var(--r3-color-primary);
  color: #fff;
}

.desktop-shell__brand-text {
  min-width: 0;
  display: grid;
}

.desktop-shell__brand-text span {
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
}

.desktop-shell__nav {
  display: grid;
  align-content: start;
  gap: 4px;
}

.desktop-shell__nav-item {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--r3-radius-md);
  padding: 0 10px;
  color: var(--r3-color-text-secondary);
  text-decoration: none;
}

.desktop-shell__nav-item:hover,
.desktop-shell__nav-item--active {
  background: var(--r3-color-primary-subtle);
  color: var(--r3-color-primary);
}

.desktop-shell__nav-item:focus-visible {
  outline: 2px solid var(--r3-color-primary);
  outline-offset: 2px;
}

.desktop-shell__nav-icon {
  width: 22px;
  height: 22px;
  background: var(--r3-color-surface-hover);
  font-size: var(--r3-font-size-xs);
}

.desktop-shell__nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-shell__sidebar-footer {
  display: grid;
  gap: 12px;
}

.desktop-shell__user {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.desktop-shell__avatar {
  width: 28px;
  height: 28px;
  background: var(--r3-color-surface-hover);
}

.desktop-shell__main {
  min-width: 0;
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.desktop-shell__topbar {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--r3-color-border);
  padding: 14px 24px;
  background: var(--r3-color-surface);
}

.desktop-shell__eyebrow,
.desktop-shell__title {
  margin: 0;
}

.desktop-shell__eyebrow {
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
}

.desktop-shell__title {
  margin-top: 2px;
  font-size: var(--r3-font-size-xl);
}

.desktop-shell__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 980px) {
  .desktop-shell {
    grid-template-columns: var(--r3-sidebar-collapsed) minmax(0, 1fr);
  }

  .desktop-shell__brand-text,
  .desktop-shell__nav-label,
  .desktop-shell__user {
    display: none;
  }
}

@media (max-width: 720px) {
  .desktop-shell__topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
