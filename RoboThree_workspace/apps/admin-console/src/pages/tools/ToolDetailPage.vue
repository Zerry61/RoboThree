<template>
  <section class="page-scaffold tool-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">工具详情</p>
      <h2>{{ selectedTool.title }}</h2>
      <p>当前展示固定演示数据；真实详情、健康状态和策略事实待接入。</p>
    </header>

    <PrototypeGateNotice />

    <section class="tool-detail-actions" aria-label="工具操作">
      <OperationGate :action="{ allowed: false, disabledReason: '真实配置能力待接入' }">
        <AdminButton variant="secondary" disabled>配置策略</AdminButton>
      </OperationGate>
      <OperationGate :action="{ allowed: false, disabledReason: '真实验证能力待接入' }">
        <AdminButton variant="secondary" disabled>验证连接</AdminButton>
      </OperationGate>
      <OperationGate :action="{ allowed: false, disabledReason: '真实启停能力待接入' }">
        <AdminButton variant="secondary" disabled>启用或停用</AdminButton>
      </OperationGate>
    </section>

    <section class="tool-detail-grid">
      <article v-for="section in visibleSections" :key="section.title" class="tool-detail-section">
        <h3>{{ section.title }}</h3>
        <dl>
          <template v-for="row in section.rows">
            <dt :key="`${row.label}-label`">{{ row.label }}</dt>
            <dd :key="`${row.label}-value`">{{ row.value }}</dd>
          </template>
        </dl>
      </article>
    </section>

    <TechnicalDetailsDisclosure title="技术详情" :rows="technicalRows" />
  </section>
</template>

<script lang="ts">
import Vue from 'vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import OperationGate from '../../components/ui/OperationGate.vue';
import PrototypeGateNotice from '../../components/tools/PrototypeGateNotice.vue';
import TechnicalDetailsDisclosure from '../../components/tools/TechnicalDetailsDisclosure.vue';
import { prototypeToolRows } from '../../fixtures/tool-pages';
import { presentToolDetail } from '../../presentation/tool-pages-presentation';
import type { AdminToolDetailSection, AdminToolListItem } from '../../types/admin-tool-pages';

type RouteLike = Vue & {
  $route: {
    params: {
      toolId?: string;
    };
  };
};

export default Vue.extend({
  name: 'ToolDetailPage',
  components: {
    AdminButton,
    OperationGate,
    PrototypeGateNotice,
    TechnicalDetailsDisclosure
  },
  computed: {
    selectedTool(): AdminToolListItem {
      const routeToolId = (this as RouteLike).$route.params.toolId;
      const fallbackTool = prototypeToolRows[0];
      if (!fallbackTool) {
        throw new Error('Admin Tool prototype fixture is empty');
      }
      return prototypeToolRows.find((tool) => tool.toolId === routeToolId) ?? fallbackTool;
    },
    sections(): readonly AdminToolDetailSection[] {
      return presentToolDetail(this.selectedTool);
    },
    visibleSections(): readonly AdminToolDetailSection[] {
      return this.sections.filter((section) => section.title !== '技术详情');
    },
    technicalRows(): AdminToolDetailSection['rows'] {
      return this.sections.find((section) => section.title === '技术详情')?.rows ?? [];
    }
  }
});
</script>
