<template>
  <SettingsPageFrame title="个人记忆" description="查看个人记忆字段并预览安全的 Markdown 结构。">
    <SettingsMemoryEditor :editable="runtimeMode === 'local_demo'" />
  </SettingsPageFrame>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { runtimeModeKey } from "../../app/runtime-mode.js";
import SettingsMemoryEditor from "./SettingsMemoryEditor.vue";
import SettingsPageFrame from "./SettingsPageFrame.vue";

defineOptions({ name: "RoboThreeSettingsMemoryPage" });

const runtimeMode = inject(runtimeModeKey, "standard");
</script>
