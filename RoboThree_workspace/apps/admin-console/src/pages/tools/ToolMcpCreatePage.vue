<template>
  <section class="page-scaffold tool-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">新增 Tool</p>
      <h2>连接 MCP</h2>
      <p>当前只展示远程服务发现壳；真实发现、选择和保存能力待接入。</p>
    </header>

    <PrototypeGateNotice message="当前页面只使用演示表单；请勿输入真实远程服务或访问材料。" />

    <ol class="tool-step-list" aria-label="连接 MCP 步骤">
      <li v-for="step in steps" :key="step.index">
        <span>{{ step.index }}</span>
        <strong>{{ step.title }}</strong>
        <p>{{ step.description }}</p>
        <AdminBadge tone="warning">待接入</AdminBadge>
      </li>
    </ol>

    <section class="tool-form-grid" aria-label="MCP 表单">
      <TextInput id="mcp-service-name" label="服务名称" value="" placeholder="例如：资料检索服务" disabled disabled-reason="真实保存待接入" />
      <TextInput id="mcp-service-address" label="服务地址" value="" placeholder="待后端接入后配置" disabled disabled-reason="真实连接待接入" />
      <SelectShell
        id="mcp-auth-mode"
        label="认证方式"
        value=""
        :options="authOptions"
        placeholder="请选择"
        disabled
      />
      <TextInput id="mcp-secret" label="访问密钥" value="" placeholder="不会在浏览器中持久化" disabled disabled-reason="真实凭据链路待接入" />
    </section>

    <section class="mcp-discovery-shell" aria-label="发现结果">
      <h3>发现结果</h3>
      <p>真实发现能力待接入；当前不展示可选择的远程 Tool 结果。</p>
      <AdminButton variant="secondary" disabled>验证并发现工具</AdminButton>
    </section>

    <ActionSummary :allowed="false" reason="真实发现、选择和保存能力待接入。" />
  </section>
</template>

<script setup lang="ts">
import ActionSummary from '../../components/ui/ActionSummary.vue';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TextInput from '../../components/ui/TextInput.vue';
import PrototypeGateNotice from '../../components/tools/PrototypeGateNotice.vue';
import { mcpCreateSteps } from '../../fixtures/tool-pages';

const steps = mcpCreateSteps;
const authOptions = [
  { value: 'none', label: '无需认证' },
  { value: 'key', label: '访问密钥' }
] as const;
</script>
