<template>
  <section class="settings-page-frame">
    <SettingsSectionLayout>
      <template #nav><SettingsSectionNav /></template>
      <R3PageHeader :title="title" :description="description">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </R3PageHeader>
      <slot />
    </SettingsSectionLayout>
  </section>
</template>

<script setup lang="ts">
import { R3PageHeader } from "../../components/ui";
import SettingsSectionLayout from "./SettingsSectionLayout.vue";
import SettingsSectionNav from "./SettingsSectionNav.vue";

defineProps<{ title: string; description: string }>();
defineOptions({ name: "RoboThreeSettingsPageFrame" });
</script>

<style scoped>
.settings-page-frame {
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 30px 24px 48px;
}

@media (max-width: 760px) {
  .settings-page-frame { padding: 20px 14px 36px; }
}
</style>

