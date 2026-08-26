<template>
  <section class="page-scaffold tool-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">工具策略</p>
      <h2>Tool 策略配置</h2>
      <p>当前只展示策略配置壳；真实权限、确认策略和生效状态待接入。</p>
    </header>

    <PrototypeGateNotice />

    <section class="tool-form-grid" aria-label="策略表单">
      <SelectShell
        id="tool-enabled"
        label="启用状态"
        value=""
        :options="stateOptions"
        placeholder="待接入"
        disabled
      />
      <SelectShell
        id="tool-risk"
        label="风险等级"
        value=""
        :options="riskOptions"
        placeholder="待接入"
        disabled
      />
      <TextInput id="tool-scope" label="使用范围" value="" placeholder="待真实权限事实接入" disabled disabled-reason="真实权限待接入" />
      <TextInput id="tool-confirmation" label="确认策略" value="" placeholder="待真实确认策略接入" disabled disabled-reason="真实确认策略待接入" />
    </section>

    <OperationGate :action="{ allowed: false, disabledReason: '真实策略保存能力待接入' }">
      <AdminButton variant="secondary" disabled>保存策略</AdminButton>
    </OperationGate>
  </section>
</template>

<script setup lang="ts">
import AdminButton from '../../components/ui/AdminButton.vue';
import OperationGate from '../../components/ui/OperationGate.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TextInput from '../../components/ui/TextInput.vue';
import PrototypeGateNotice from '../../components/tools/PrototypeGateNotice.vue';

const stateOptions = [
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' }
] as const;

const riskOptions = [
  { value: 'read', label: '读取' },
  { value: 'write', label: '写入' },
  { value: 'external', label: '外部调用' }
] as const;
</script>
