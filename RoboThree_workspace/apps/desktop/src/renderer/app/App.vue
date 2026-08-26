<template>
  <RouterView v-if="chromeFree" />
  <DesktopShell v-else :items="primaryNavigationItems">
    <RouterView v-slot="{ Component }">
      <KeepAlive include="RoboThreeWorkbench">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </DesktopShell>
</template>

<script setup lang="ts">
import { computed, KeepAlive } from "vue";
import { RouterView, useRoute } from "vue-router";

import { primaryNavigationItems } from "./navigation.js";
import DesktopShell from "../components/shell/DesktopShell.vue";

const route = useRoute();
const chromeFree = computed(() => route.meta.chrome === false);
</script>
