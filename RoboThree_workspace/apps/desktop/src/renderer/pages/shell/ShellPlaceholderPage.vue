<template>
  <section class="shell-placeholder">
    <R3PageHeader
      :title="title"
      :description="description"
      eyebrow="DFE-1B skeleton"
    />

    <div class="shell-placeholder__grid">
      <R3Card title="页面状态">
        <div class="shell-placeholder__stack">
          <R3InlineNotice :tone="noticeTone" :title="stateTitle">
            {{ stateDescription }}
          </R3InlineNotice>
          <R3Skeleton v-if="state === 'loading'" height="18px" />
          <R3Skeleton v-if="state === 'loading'" width="64%" height="18px" />
          <R3EmptyState
            v-if="state === 'empty'"
            title="暂无内容"
            description="此页面等待后续批次接入真实 Projection 或明确 Mock 数据。"
            icon="0"
          />
        </div>
      </R3Card>

      <R3Card title="通用反馈">
        <div class="shell-placeholder__stack">
          <R3InlineNotice title="Permission" tone="warning">
            权限不足时显示受控提示，不暴露路径、凭据或内部 payload。
          </R3InlineNotice>
          <R3InlineNotice title="Unavailable">
            服务暂不可用时保持页面可恢复，不自动发起新的副作用。
          </R3InlineNotice>
          <R3InlineNotice title="Error" tone="danger">
            错误状态使用用户语言，不展示内部异常栈。
          </R3InlineNotice>
        </div>
      </R3Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import {
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3PageHeader,
  R3Skeleton,
} from "../../components/ui";

const route = useRoute();

const title = computed(() => typeof route.meta.title === "string" ? route.meta.title : "页面");
const description = computed(() => (
  typeof route.meta.description === "string"
    ? route.meta.description
    : "此页面为 DFE-1B 导航骨架，真实业务接入仍按后续批次授权。"
));
const state = computed(() => typeof route.meta.placeholderState === "string" ? route.meta.placeholderState : "empty");
const stateTitle = computed(() => {
  if (state.value === "loading") return "Loading";
  if (state.value === "permission") return "Permission required";
  if (state.value === "unavailable") return "Unavailable";
  if (state.value === "error") return "Error";
  return "Empty";
});
const stateDescription = computed(() => {
  if (state.value === "loading") return "页面加载状态使用骨架屏，不改变任务运行状态。";
  if (state.value === "permission") return "缺少权限时失败关闭，等待用户切换或授权工作区。";
  if (state.value === "unavailable") return "依赖服务不可用时保留导航和恢复入口。";
  if (state.value === "error") return "错误状态不展示内部堆栈、路径或凭据。";
  return "暂无数据时使用明确空态，不假装真实数据已经接入。";
});
const noticeTone = computed(() => {
  if (state.value === "permission" || state.value === "unavailable") return "warning";
  if (state.value === "error") return "danger";
  return "info";
});
</script>

<style scoped>
.shell-placeholder {
  min-height: 100%;
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 24px;
}

.shell-placeholder__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: 16px;
}

.shell-placeholder__stack {
  display: grid;
  gap: 12px;
}

@media (max-width: 900px) {
  .shell-placeholder__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
