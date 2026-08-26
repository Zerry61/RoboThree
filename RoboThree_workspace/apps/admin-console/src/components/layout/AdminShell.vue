<template>
  <div class="admin-shell">
    <a class="skip-link" href="#admin-main">跳到主内容</a>
    <aside class="admin-shell__sidebar" aria-label="管理端一级导航">
      <div class="admin-shell__brand">RoboThree Admin</div>
      <nav class="primary-nav" aria-label="一级导航">
        <NavLink
          v-for="item in primaryNavigation"
          :key="item.key"
          class="primary-nav__item"
          :class="{ 'primary-nav__item--active': item.key === activeNavKey }"
          :to="item.path"
        >
          {{ item.label }}
        </NavLink>
      </nav>
    </aside>
    <section class="admin-shell__body">
      <TopBar :title="pageTitle" />
      <SystemSubNav
        v-if="activeNavKey === 'system'"
        :items="systemNavigation"
        :active-key="activeSystemSubKey"
      />
      <main id="admin-main" class="admin-shell__main" tabindex="-1">
        <slot />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import NavLink from './NavLink.vue';
import TopBar from './TopBar.vue';
import SystemSubNav from './SystemSubNav.vue';
import { getVisiblePrimaryNavigation, getVisibleSystemNavigation } from '../../app/navigation';
import type { PermissionProjection } from '../../app/permission-shell';
import type { AdminRouteMeta } from '../../app/route-meta';

const props = defineProps<{
  permissionProjection: PermissionProjection;
}>();

const instance = getCurrentInstance();
const routeMeta = computed(() => instance?.proxy.$route.meta as AdminRouteMeta | undefined);
const pageTitle = computed(() => routeMeta.value?.pageTitle ?? 'RoboThree Admin');
const activeNavKey = computed(() => routeMeta.value?.navKey ?? 'models');
const activeSystemSubKey = computed(() => routeMeta.value?.systemSubKey ?? '');
const primaryNavigation = computed(() => getVisiblePrimaryNavigation(props.permissionProjection));
const systemNavigation = computed(() => getVisibleSystemNavigation(props.permissionProjection));
</script>
