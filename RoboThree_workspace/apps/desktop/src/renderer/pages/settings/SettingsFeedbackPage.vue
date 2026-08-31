<template>
  <SettingsPageFrame title="问题反馈" description="描述遇到的问题。反馈接收能力开放后才能正式提交。">
    <SettingsFeedbackForm />
  </SettingsPageFrame>
</template>

<script setup lang="ts">
import SettingsFeedbackForm from "./SettingsFeedbackForm.vue";
import SettingsPageFrame from "./SettingsPageFrame.vue";

defineOptions({ name: "RoboThreeSettingsFeedbackPage" });

</script>
