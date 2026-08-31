<template>
  <nav class="settings-section-nav" aria-label="设置导航">
    <RouterLink
      v-for="item in settingsSections"
      :key="item.key"
      v-slot="{ href, isActive, navigate }"
      :to="{ name: item.routeName }"
      custom
    >
      <a
        :href="href"
        class="settings-section-nav__item"
        :class="{ 'settings-section-nav__item--active': isActive }"
        :aria-current="isActive ? 'page' : undefined"
        @click="navigate"
      >
        <span>{{ item.label }}</span>
        <R3Tag :tone="item.capabilityState === 'available' ? 'neutral' : 'warning'">
          {{ item.statusLabel }}
        </R3Tag>
      </a>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";

import { R3Tag } from "../../components/ui";
import { settingsSections } from "./settings-section-model.js";

defineOptions({ name: "RoboThreeSettingsSectionNav" });
</script>

<style scoped>
.settings-section-nav {
  padding: 2px 0;
  display: grid;
  gap: 2px;
}

.settings-section-nav__item {
  min-height: 38px;
  border-radius: var(--r3-radius-sm);
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--r3-color-text-secondary);
  text-decoration: none;
  outline: none;
}

.settings-section-nav__item--active {
  background: #e9edf6;
  color: var(--r3-color-text);
  font-weight: 700;
}

.settings-section-nav__item:focus-visible {
  box-shadow: var(--r3-focus-ring);
}

@media (max-width: 980px) {
  .settings-section-nav {
    position: static;
  }
}
</style>
