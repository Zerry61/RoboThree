<template>
  <SettingsCapabilityGatePage :config="config" />
</template>

<script setup lang="ts">
import SettingsCapabilityGatePage from "./SettingsCapabilityGatePage.vue";
import { getSettingsGateConfig } from "./settings-section-model.js";

defineOptions({ name: "RoboThreeSettingsFeedbackPage" });

const config = getSettingsGateConfig("feedback");
</script>
