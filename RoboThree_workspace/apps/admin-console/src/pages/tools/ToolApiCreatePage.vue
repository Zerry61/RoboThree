<template>
  <section class="page-scaffold tool-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">新增 Tool</p>
      <h2>连接 API</h2>
      <p>当前只展示接入表单壳；真实解析、验证和保存能力待接入。</p>
    </header>

    <PrototypeGateNotice message="当前页面只使用演示表单；请勿输入真实访问材料。" />

    <ol class="tool-step-list" aria-label="连接 API 步骤">
      <li v-for="step in steps" :key="step.index">
        <span>{{ step.index }}</span>
        <strong>{{ step.title }}</strong>
        <p>{{ step.description }}</p>
        <AdminBadge tone="warning">待接入</AdminBadge>
      </li>
    </ol>

    <section class="tool-form-grid" aria-label="API 表单">
      <TextInput id="api-tool-title" label="Tool 名称" value="" placeholder="例如：客户系统查询" disabled disabled-reason="真实保存待接入" />
      <TextInput id="api-tool-key" label="技术名称" value="" placeholder="例如：tool.company.customer.lookup" disabled disabled-reason="真实保存待接入" />
      <TextInput id="api-address" label="访问地址" value="" placeholder="待后端接入后配置" disabled disabled-reason="真实连接待接入" />
      <SelectShell
        id="api-auth-mode"
        label="认证方式"
        value=""
        :options="authOptions"
        placeholder="请选择"
        disabled
      />
      <TextInput id="api-secret" label="访问密钥" value="" placeholder="不会在浏览器中持久化" disabled disabled-reason="真实凭据链路待接入" />
      <TextInput id="api-scope" label="使用范围" value="" placeholder="待真实权限事实接入" disabled disabled-reason="真实权限待接入" />
    </section>

    <section class="curl-demo-shell" aria-label="cURL 演示">
      <h3>cURL 演示解析</h3>
      <p>演示解析仅会填充本地表单预览；当前批次不产生创建、保存或验证结果。</p>
      <AdminButton variant="secondary" disabled>解析并填入</AdminButton>
    </section>

    <ActionSummary :allowed="false" reason="真实连接、验证和保存能力待接入。" />
  </section>
</template>

<script setup lang="ts">
import ActionSummary from '../../components/ui/ActionSummary.vue';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TextInput from '../../components/ui/TextInput.vue';
import PrototypeGateNotice from '../../components/tools/PrototypeGateNotice.vue';
import { apiCreateSteps } from '../../fixtures/tool-pages';

const steps = apiCreateSteps;
const authOptions = [
  { value: 'none', label: '无需认证' },
  { value: 'key', label: '访问密钥' }
] as const;
</script>
