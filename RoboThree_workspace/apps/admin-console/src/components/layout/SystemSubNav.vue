<template>
  <nav class="system-sub-nav" aria-label="系统管理二级导航">
    <NavLink
      v-for="item in items"
      :key="item.key"
      class="system-sub-nav__item"
      :class="{ 'system-sub-nav__item--active': item.key === activeKey }"
      :to="item.path"
    >
      {{ item.label }}
    </NavLink>
  </nav>
</template>

<script setup lang="ts">
import NavLink from './NavLink.vue';
import type { SystemNavigationItem } from '../../app/navigation';

defineProps<{
  items: readonly SystemNavigationItem[];
  activeKey: string;
}>();
</script>
