<template>
  <section class="page-scaffold tool-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">工具管理</p>
      <h2>工具管理</h2>
      <p>统一查看代码工具、连接 API 和 MCP 服务；真实配置、验证和启停能力待接入。</p>
    </header>

    <PrototypeGateNotice />

    <TableToolbar title="工具列表" summary="演示筛选仅作用于当前固定数据，不代表真实 Catalog 查询。">
      <TextInput
        id="tool-search"
        label="搜索"
        value=""
        placeholder="按名称或技术名称筛选"
        disabled
        disabled-reason="真实检索待接入"
      />
      <AdminButton variant="secondary" disabled>更多筛选</AdminButton>
    </TableToolbar>

    <section class="tool-create-entry" aria-label="新增 Tool">
      <h3>新增 Tool</h3>
      <div class="tool-create-entry__grid">
        <article v-for="entry in createEntries" :key="entry.key" class="tool-create-entry__card">
          <h4>{{ entry.title }}</h4>
          <p>{{ entry.description }}</p>
          <AdminButton variant="secondary" disabled>进入页面壳</AdminButton>
        </article>
      </div>
      <ActionSummary :allowed="false" reason="代码工具由可信发布流程自动登记，管理端不提供新增入口。" />
    </section>

    <AdminTable :columns="columns" caption="工具管理列表">
      <tr v-for="row in rows" :key="row.toolId">
        <td>
          <a :href="`#${row.detailPath}`">{{ row.title }}</a>
          <span class="tool-page__muted">{{ row.technicalName }}</span>
          <AdminBadge tone="neutral">{{ row.gatedLabel }}</AdminBadge>
        </td>
        <td>
          <span>{{ row.sourceLabel }}</span>
          <span class="tool-page__muted">{{ row.executionLabel }}</span>
        </td>
        <td>
          <ul class="tool-status-list">
            <li v-for="status in row.statusItems" :key="status">{{ status }}</li>
          </ul>
        </td>
        <td>
          <AdminBadge :tone="row.riskTone">{{ row.riskLabel }}</AdminBadge>
          <span class="tool-page__muted">{{ row.rangeSummary }}</span>
        </td>
        <td>{{ row.updatedAtLabel }}</td>
        <td>
          <OperationGate :action="{ allowed: false, disabledReason: '真实操作待接入' }">
            <AdminButton variant="secondary" disabled>查看</AdminButton>
          </OperationGate>
        </td>
      </tr>
    </AdminTable>
  </section>
</template>

<script setup lang="ts">
import ActionSummary from '../../components/ui/ActionSummary.vue';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import AdminTable from '../../components/ui/AdminTable.vue';
import OperationGate from '../../components/ui/OperationGate.vue';
import TableToolbar from '../../components/ui/TableToolbar.vue';
import TextInput from '../../components/ui/TextInput.vue';
import PrototypeGateNotice from '../../components/tools/PrototypeGateNotice.vue';
import { prototypeToolRows, toolCreateEntries } from '../../fixtures/tool-pages';
import { presentToolListRow } from '../../presentation/tool-pages-presentation';
import type { TableColumn } from '../../types/admin-ui';

const columns: readonly TableColumn[] = [
  { key: 'tool', label: 'Tool' },
  { key: 'source', label: '接入方式' },
  { key: 'status', label: '状态' },
  { key: 'governance', label: '治理' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'actions', label: '操作' }
];

const rows = prototypeToolRows.map(presentToolListRow);
const createEntries = toolCreateEntries;
</script>
