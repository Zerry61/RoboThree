<template>
  <main class="design-system-gallery">
    <R3PageHeader
      eyebrow="DFE-1A"
      title="Frontend Living Spec"
      description="Renderer foundation components, tokens, states, and migration surface for the Desktop shell."
    >
      <template #actions>
        <R3StatusBadge tone="success">dev-only</R3StatusBadge>
        <R3Button variant="primary">Primary</R3Button>
      </template>
    </R3PageHeader>

    <section class="design-system-gallery__grid">
      <R3Card title="Actions">
        <div class="design-system-gallery__stack">
          <div class="design-system-gallery__row">
            <R3Button variant="primary">Run</R3Button>
            <R3Button>Secondary</R3Button>
            <R3Button variant="danger">Delete</R3Button>
            <R3Button loading>Loading</R3Button>
            <R3Tooltip text="Icon buttons use accessible labels.">
              <R3IconButton label="Refresh">R</R3IconButton>
            </R3Tooltip>
          </div>
          <R3InlineNotice title="Boundary">Components do not call Desktop IPC directly.</R3InlineNotice>
        </div>
      </R3Card>

      <R3Card title="Inputs">
        <div class="design-system-gallery__stack">
          <R3SearchField v-model="query" placeholder="Search tasks" />
          <R3Input v-model="name" label="Name" placeholder="Workspace name" />
          <R3Textarea v-model="notes" label="Notes" placeholder="Add context" />
          <R3Select v-model="mode" label="Mode" :options="modeOptions" />
          <R3Tabs v-model="tab" :tabs="tabs" label="Gallery sections" />
        </div>
      </R3Card>

      <R3Card title="Status">
        <div class="design-system-gallery__stack">
          <div class="design-system-gallery__row">
            <R3Tag>neutral</R3Tag>
            <R3Tag tone="primary">primary</R3Tag>
            <R3Tag tone="success">success</R3Tag>
            <R3Tag tone="warning">warning</R3Tag>
            <R3Tag tone="danger">danger</R3Tag>
          </div>
          <R3InlineNotice tone="warning" title="Mock inventory">
            Large mock payloads stay out of production Renderer modules.
          </R3InlineNotice>
          <R3Skeleton width="72%" />
          <R3Spinner />
        </div>
      </R3Card>

      <R3Card title="Empty State">
        <R3EmptyState
          icon="A"
          title="No artifact selected"
          description="Artifact previews are opened through bounded projections and sandboxed preview routes."
        >
          <template #actions>
            <R3Button>Browse artifacts</R3Button>
          </template>
        </R3EmptyState>
      </R3Card>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3IconButton,
  R3InlineNotice,
  R3Input,
  R3PageHeader,
  R3SearchField,
  R3Select,
  R3Skeleton,
  R3Spinner,
  R3StatusBadge,
  R3Tabs,
  R3Tag,
  R3Textarea,
} from "../../components/ui";

const query = ref("");
const name = ref("RoboThree");
const notes = ref("Document tools, artifacts, and controlled previews.");
const mode = ref("normal");
const tab = ref("components");

const modeOptions = [
  { label: "Normal", value: "normal" },
  { label: "Review", value: "review" },
  { label: "Disabled", value: "disabled", disabled: true },
];

const tabs = [
  { label: "Components", value: "components" },
  { label: "States", value: "states" },
  { label: "Tokens", value: "tokens" },
];
</script>

<style scoped>
.design-system-gallery {
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 24px;
  padding: 28px;
  background: var(--r3-color-background);
}

.design-system-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.design-system-gallery__stack {
  display: grid;
  gap: 12px;
}

.design-system-gallery__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
