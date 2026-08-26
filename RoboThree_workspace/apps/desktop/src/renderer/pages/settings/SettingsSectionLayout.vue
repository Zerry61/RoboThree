<template>
  <div class="settings-section-layout">
    <aside class="settings-section-layout__nav">
      <slot name="nav" />
    </aside>
    <div class="settings-section-layout__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "RoboThreeSettingsSectionLayout" });
</script>

<style scoped>
.settings-section-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.settings-section-layout__nav {
  position: sticky;
  top: 18px;
  min-width: 0;
}

.settings-section-layout__content {
  min-width: 0;
  display: grid;
  gap: 12px;
}

@media (max-width: 980px) {
  .settings-section-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-section-layout__nav {
    position: static;
  }
}
</style>
