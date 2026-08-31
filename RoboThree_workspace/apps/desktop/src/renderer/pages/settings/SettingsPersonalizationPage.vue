<template>
  <SettingsPageFrame title="个性化" description="自定义 AI 的回复偏好。真实任务接入前，仅提供本页预览。">
    <SettingsPersonalizationForm :editable="runtimeMode === 'local_demo'" />
  </SettingsPageFrame>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { runtimeModeKey } from "../../app/runtime-mode.js";
import SettingsPageFrame from "./SettingsPageFrame.vue";
import SettingsPersonalizationForm from "./SettingsPersonalizationForm.vue";

defineOptions({ name: "RoboThreeSettingsPersonalizationPage" });

const runtimeMode = inject(runtimeModeKey, "standard");
</script>
