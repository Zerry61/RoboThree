<template>
  <section class="intelligence-detail" aria-label="智能资源详情">
    <button type="button" class="intelligence-detail__back" @click="void returnToCatalog()">
      <span aria-hidden="true">←</span> 返回智能中心
    </button>

    <header class="intelligence-detail__page-header">
      <div>
        <p>{{ sectionLabel }}</p>
        <h2>{{ pageTitle }}</h2>
        <span>{{ pageDescription }}</span>
      </div>
      <R3Button v-if="state.status === 'error' || state.status === 'unavailable'" variant="secondary" @click="void loadDetail()">
        重新加载
      </R3Button>
    </header>

    <div v-if="state.status === 'loading'" class="intelligence-detail__loading" aria-label="正在加载详情">
      <R3Skeleton />
      <R3Skeleton />
      <R3Skeleton />
    </div>

    <R3InlineNotice
      v-else-if="state.status === 'error' || state.status === 'unavailable'"
      :tone="state.status === 'error' ? 'danger' : 'warning'"
      :title="state.messageTitle"
    >
      {{ state.messageDescription }}
    </R3InlineNotice>

    <template v-else-if="state.skill">
      <R3Card>
        <article class="intelligence-detail__hero" data-intelligence-detail="skills">
          <span class="intelligence-detail__avatar" aria-hidden="true">S</span>
          <div>
            <div class="intelligence-detail__identity">
              <h3>{{ state.skill.displayTitle }}</h3>
              <R3Tag tone="neutral">{{ presentSkillSource(state.skill.sourceKind) }}</R3Tag>
              <R3Tag tone="neutral">{{ presentSkillAvailability(state.skill.availability) }}</R3Tag>
            </div>
            <p>{{ state.skill.displayDescription }}</p>
          </div>
        </article>
      </R3Card>

      <div class="intelligence-detail__sections">
        <R3Card>
          <template #header><h3>技能信息</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>技术名称</dt><dd>{{ state.skill.technicalName }}</dd></div>
            <div><dt>版本</dt><dd>{{ state.skill.semanticVersion ?? "当前保存版本" }}</dd></div>
            <div><dt>来源</dt><dd>{{ presentSkillSource(state.skill.sourceKind) }}</dd></div>
            <div v-if="state.skill.creatorDisplayName"><dt>创建人</dt><dd>{{ state.skill.creatorDisplayName }}</dd></div>
          </dl>
        </R3Card>
        <R3Card>
          <template #header><h3>当前状态</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>可用状态</dt><dd>{{ presentSkillAvailability(state.skill.availability) }}</dd></div>
            <div v-if="state.skill.sourceKind === 'personal_creator'"><dt>测试</dt><dd>{{ presentSkillTest(state.skill.draftTestFact?.state) }}</dd></div>
            <div v-if="state.skill.sourceKind === 'personal_creator'"><dt>提交</dt><dd>{{ presentSkillSubmission(state.skill.submission?.state) }}</dd></div>
            <div v-if="state.skill.installed"><dt>安装</dt><dd>已安装当前精确版本</dd></div>
          </dl>
        </R3Card>
      </div>

      <R3Card v-if="state.skill.safeMarkdown">
        <template #header><h3>技能说明</h3></template>
        <pre class="intelligence-detail__markdown">{{ state.skill.safeMarkdown }}</pre>
      </R3Card>

      <R3InlineNotice v-if="operationMessage" :tone="operationTone" title="技能操作">
        {{ operationMessage }}
      </R3InlineNotice>

      <R3Card v-if="state.skill.sourceKind === 'personal_creator'">
        <template #header><h3>测试与发布</h3></template>
        <div class="intelligence-detail__skill-actions">
          <R3Textarea
            v-model="testInput"
            label="测试任务"
            :rows="3"
            placeholder="输入一条用于验证当前保存版本的任务。"
            :disabled="operationBusy"
          />
          <div class="intelligence-detail__submit-fields">
            <R3Input v-model="semanticVersion" label="发布版本" :disabled="operationBusy" />
            <R3Input v-model="changeSummary" label="更新说明" :disabled="operationBusy" />
          </div>
          <div class="intelligence-detail__action-row">
            <R3Button variant="secondary" :loading="operationBusy" @click="void refreshDraft()">刷新草稿</R3Button>
            <R3Button variant="secondary" :loading="operationBusy" :disabled="testInput.trim() === ''" @click="void startTest()">运行测试</R3Button>
            <R3Button variant="primary" :loading="operationBusy" :disabled="!canSubmitCurrentSkill" @click="void submitDraft()">提交发布</R3Button>
            <R3Button
              v-if="state.skill.submission?.state === 'pending_review'"
              variant="secondary"
              :loading="operationBusy"
              @click="void withdrawSubmission()"
            >撤回提交</R3Button>
          </div>
          <p v-if="!canSubmitCurrentSkill" class="intelligence-detail__hint">
            只有当前保存版本测试通过后才能提交发布。
          </p>
        </div>
      </R3Card>

      <R3Card v-else-if="scope === 'marketplace' && !state.skill.installed">
        <template #header><h3>安装</h3></template>
        <div class="intelligence-detail__action-row">
          <R3Button
            variant="primary"
            :loading="operationBusy"
            :disabled="state.skill.availability !== 'available' || state.skill.packageFacts === undefined"
            @click="void installSkill()"
          >安装技能</R3Button>
        </div>
      </R3Card>

      <R3Card v-else-if="scope === 'installed' || state.skill.installed">
        <template #header><h3>本机安装</h3></template>
        <div class="intelligence-detail__action-row">
          <R3Button
            variant="danger"
            :loading="operationBusy"
            :disabled="state.skill.installationRevision === undefined"
            @click="void uninstallSkill()"
          >卸载技能</R3Button>
        </div>
      </R3Card>

      <R3InlineNotice v-else tone="neutral" title="本地技能">
        本地技能只显示安全来源和兼容状态；绝对路径不会进入页面。
      </R3InlineNotice>
    </template>

    <template v-else-if="state.robot">
      <R3Card>
        <article class="intelligence-detail__hero" data-intelligence-detail="robots">
          <span class="intelligence-detail__avatar" aria-hidden="true">R</span>
          <div>
            <div class="intelligence-detail__identity">
              <h3>{{ state.robot.name }}</h3>
              <R3Tag tone="neutral">{{ state.robot.sourceLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ state.robot.runnableLabel }}</R3Tag>
            </div>
            <p>{{ state.robot.description }}</p>
          </div>
        </article>
      </R3Card>

      <div class="intelligence-detail__sections">
        <R3Card>
          <template #header><h3>运行配置</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>默认模型</dt><dd>{{ state.robot.defaultModel.name }} · {{ state.robot.defaultModel.availabilityLabel }}</dd></div>
            <div><dt>模型切换</dt><dd>{{ state.robot.allowModelOverrideLabel }}</dd></div>
            <div><dt>可用模型</dt><dd>{{ resourceNames(state.robot.eligibleModels) }}</dd></div>
          </dl>
        </R3Card>
        <R3Card>
          <template #header><h3>可用资源</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>技能</dt><dd>{{ resourceNames(state.robot.skills) }}</dd></div>
            <div><dt>工具</dt><dd>{{ resourceNames(state.robot.tools) }}</dd></div>
            <div><dt>知识</dt><dd>{{ resourceNames(state.robot.knowledge) }}</dd></div>
          </dl>
        </R3Card>
      </div>
    </template>

    <template v-else-if="state.tool">
      <R3Card>
        <article class="intelligence-detail__hero" data-intelligence-detail="tools">
          <span class="intelligence-detail__avatar" aria-hidden="true">T</span>
          <div>
            <div class="intelligence-detail__identity">
              <h3>{{ state.tool.name }}</h3>
              <R3Tag tone="neutral">{{ state.tool.sourceLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ state.tool.availabilityLabel }}</R3Tag>
            </div>
            <p>{{ state.tool.description }}</p>
          </div>
        </article>
      </R3Card>

      <div class="intelligence-detail__sections">
        <R3Card>
          <template #header><h3>使用边界</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>读写边界</dt><dd>{{ state.tool.readOnlyLabel }}</dd></div>
            <div><dt>风险摘要</dt><dd>{{ state.tool.riskLabels.join("，") }}</dd></div>
          </dl>
        </R3Card>
        <R3Card>
          <template #header><h3>数据形态</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>输入</dt><dd>{{ state.tool.inputShapeLabel }}</dd></div>
            <div><dt>输出</dt><dd>{{ state.tool.outputShapeLabel }}</dd></div>
          </dl>
        </R3Card>
      </div>
    </template>

    <R3EmptyState
      v-else
      title="没有找到该资源"
      description="资源可能已移除或当前目录不可用，请返回智能中心刷新。"
    />
  </section>
</template>

<script setup lang="ts">
import type { SkillDetail, SkillListScope, SkillSummary } from "@robothree/contracts/skill-lifecycle/v1alpha1";
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3Input,
  R3Skeleton,
  R3Tag,
  R3Textarea,
} from "../../components/ui";
import {
  skillLifecycleAdapterKey,
  SkillLifecycleAdapterError,
  unavailableSkillLifecycleAdapter,
} from "../../adapters/skill-lifecycle-adapter.js";
import {
  desktopIntelligenceAdapter,
  DesktopIntelligenceAdapterError,
  intelligenceAdapterKey,
} from "../../adapters/intelligence-adapter.js";
import {
  buildRobotDetailView,
  buildToolDetailView,
  presentCatalogError,
  type CatalogMessageState,
  type ResourceView,
  type RobotDetailView,
  type ToolDetailView,
} from "./intelligence-model.js";
import {
  canSubmitSkill,
  presentSkillAvailability,
  presentSkillLifecycleError,
  presentSkillSource,
  presentSkillSubmission,
  presentSkillTest,
} from "../../presentation/skill-lifecycle-presentation.js";

type DetailSection = "robots" | "skills" | "tools";

type DetailState = {
  status: CatalogMessageState;
  messageTitle: string;
  messageDescription: string;
  robot?: RobotDetailView;
  tool?: ToolDetailView;
  skill?: SkillDetail;
};

const route = useRoute();
const router = useRouter();
const adapter = inject(intelligenceAdapterKey, desktopIntelligenceAdapter);
const skillAdapter = inject(skillLifecycleAdapterKey, unavailableSkillLifecycleAdapter);
const state = reactive<DetailState>({
  status: "loading",
  messageTitle: "",
  messageDescription: "",
});
let requestEpoch = 0;
let operationEpoch = 0;
const operationBusy = ref(false);
const operationMessage = ref("");
const operationTone = ref<"neutral" | "warning" | "danger">("neutral");
const testInput = ref("");
const semanticVersion = ref("1.0.0");
const changeSummary = ref("提交当前技能版本审核");

const section = computed<DetailSection>(() => {
  if (route.name === "intelligenceRobotDetail") return "robots";
  if (route.name === "intelligenceSkillDetail") return "skills";
  return "tools";
});
const resourceId = computed(() => {
  const value = route.params.robotId ?? route.params.skillId ?? route.params.toolId;
  return typeof value === "string" && value.length <= 256 && !value.includes("\0") ? value : "";
});
const sectionLabel = computed(() => ({ robots: "机器人", skills: "技能", tools: "工具" })[section.value]);
const pageTitle = computed(() => state.robot?.name ?? state.tool?.name ?? state.skill?.displayTitle ?? `${sectionLabel.value}详情`);
const scope = computed<SkillListScope>(() => parseScope(route.query.scope));
const skillSourceKind = computed<SkillSummary["sourceKind"] | undefined>(() => {
  const value = route.query.sourceKind;
  return typeof value === "string" && [
    "code_owned",
    "personal_creator",
    "admin_upload",
    "local_user_directory",
    "local_workspace_directory",
  ].includes(value) ? value as SkillSummary["sourceKind"] : undefined;
});
const canSubmitCurrentSkill = computed(() => state.skill !== undefined
  && canSubmitSkill(state.skill)
  && /^\d+\.\d+\.\d+$/u.test(semanticVersion.value)
  && changeSummary.value.trim() !== "");
const pageDescription = computed(() => {
  if (section.value === "robots") return "查看机器人的模型与任务资源范围。";
  if (section.value === "tools") return "查看工具用途、读写边界和风险摘要。";
  return "查看技能说明、行为规则与可用状态。";
});

watch([section, resourceId], () => {
  void loadDetail();
}, { immediate: true });

onBeforeUnmount(() => { operationEpoch += 1; });

async function loadDetail(): Promise<void> {
  const epoch = ++requestEpoch;
  const currentSection = section.value;
  const currentId = resourceId.value;
  state.robot = undefined;
  state.tool = undefined;
  state.skill = undefined;
  state.messageTitle = "";
  state.messageDescription = "";

  if (currentId === "") {
    state.status = "empty";
    return;
  }

  state.status = "loading";
  try {
    if (currentSection === "skills") {
      const compatibility = await skillAdapter.getSkillLifecycleCompatibility();
      if (!isCurrent(epoch, currentSection, currentId)) return;
      if (!compatibility.serviceAvailable) {
        state.status = "unavailable";
        state.messageTitle = "技能服务暂不可用";
        state.messageDescription = "当前未连接真实技能服务，不会展示示例数据。";
        return;
      }
      state.skill = await skillAdapter.getSkill({
        skillId: currentId,
        ...(skillSourceKind.value === undefined ? {} : { sourceKind: skillSourceKind.value }),
      });
      if (!isCurrent(epoch, currentSection, currentId)) {
        state.skill = undefined;
        return;
      }
      state.status = "ready";
      return;
    }
    const compatibility = await adapter.negotiateCatalog();
    if (!isCurrent(epoch, currentSection, currentId)) return;
    if (!compatibility.available) {
      state.status = "unavailable";
      state.messageTitle = "目录能力不可用";
      state.messageDescription = compatibility.safeSummary ?? "智能资源目录暂不可用。";
      return;
    }
    if (currentSection === "robots") {
      state.robot = buildRobotDetailView(await adapter.getRobot({ robotId: currentId }));
    } else {
      state.tool = buildToolDetailView(await adapter.getTool({ toolId: currentId }));
    }
    if (!isCurrent(epoch, currentSection, currentId)) {
      state.robot = undefined;
      state.tool = undefined;
      return;
    }
    state.status = "ready";
  } catch (caught) {
    if (!isCurrent(epoch, currentSection, currentId)) return;
    if (caught instanceof SkillLifecycleAdapterError) {
      state.status = caught.code === "skilllifecycle.service_unavailable" ? "unavailable" : "error";
      state.messageTitle = "技能操作未完成";
      state.messageDescription = presentSkillLifecycleError({ code: caught.code, safeSummary: caught.safeSummary });
      return;
    }
    const message = presentCatalogError(caught instanceof DesktopIntelligenceAdapterError
      ? { code: caught.code, safeSummary: caught.safeSummary, retryable: caught.retryable }
      : { code: "catalog.registry_unavailable", safeSummary: "目录暂不可用。" });
    state.status = message.state;
    state.messageTitle = message.title;
    state.messageDescription = message.description;
  }
}

async function refreshDraft(): Promise<void> {
  const skill = state.skill;
  if (skill === undefined) return;
  await runMutation(async () => {
    await skillAdapter.refreshSkillDraft({
      skillId: skill.skillId,
      expectedDraftRevision: skill.revision,
    });
    operationMessage.value = "已刷新为最新保存版本。";
  });
}

async function startTest(): Promise<void> {
  const skill = state.skill;
  if (skill === undefined || testInput.value.trim() === "") return;
  await runMutation(async () => {
    const receipt = await skillAdapter.startSkillDraftTest({
      skillId: skill.skillId,
      expectedDraftRevision: skill.revision,
      testInput: testInput.value.trim(),
    });
    operationMessage.value = "测试已开始，正在等待真实任务结果。";
    if (receipt.operationId !== undefined) await pollOperation(receipt.operationId);
  });
}

async function submitDraft(): Promise<void> {
  const skill = state.skill;
  if (skill === undefined || !canSubmitCurrentSkill.value) return;
  await runMutation(async () => {
    await skillAdapter.submitSkillDraft({
      skillId: skill.skillId,
      expectedDraftRevision: skill.revision,
      semanticVersion: semanticVersion.value,
      changeSummary: changeSummary.value.trim(),
    });
    operationMessage.value = "已提交企业审核。";
  });
}

async function withdrawSubmission(): Promise<void> {
  const skill = state.skill;
  if (skill?.submission === undefined) return;
  await runMutation(async () => {
    await skillAdapter.withdrawSkillSubmission({
      skillId: skill.skillId,
      submissionId: skill.submission!.submissionId,
      expectedSubmissionRevision: skill.submission!.submissionRevision,
    });
    operationMessage.value = "提交已撤回。";
  });
}

async function installSkill(): Promise<void> {
  const skill = state.skill;
  if (skill?.packageFacts === undefined || skill.availability !== "available") return;
  await runMutation(async () => {
    const receipt = await skillAdapter.installSkillRelease({
      skillId: skill.skillId,
      releaseRevision: skill.revision,
      packageDigest: skill.packageFacts!.packageDigest,
      mode: skill.installed ? "replace_with_exact_release" : "install_exact",
    });
    operationMessage.value = "安装已开始。";
    if (receipt.operationId !== undefined) await pollOperation(receipt.operationId);
  });
}

async function uninstallSkill(): Promise<void> {
  const skill = state.skill;
  if (skill?.installationRevision === undefined) return;
  await runMutation(async () => {
    const receipt = await skillAdapter.uninstallSkillRelease({
      skillId: skill.skillId,
      releaseRevision: skill.revision,
      expectedInstallationRevision: skill.installationRevision!,
    });
    operationMessage.value = "卸载已开始。";
    if (receipt.operationId !== undefined) await pollOperation(receipt.operationId);
  });
}

async function runMutation(operation: () => Promise<void>): Promise<void> {
  if (operationBusy.value) return;
  const epoch = ++operationEpoch;
  operationBusy.value = true;
  operationMessage.value = "";
  operationTone.value = "neutral";
  try {
    await operation();
    if (epoch !== operationEpoch) return;
    await loadDetail();
  } catch (caught) {
    if (epoch !== operationEpoch) return;
    operationTone.value = "danger";
    operationMessage.value = presentSkillLifecycleError(caught instanceof SkillLifecycleAdapterError
      ? { code: caught.code, safeSummary: caught.safeSummary }
      : {});
    if (caught instanceof SkillLifecycleAdapterError && [
      "skilllifecycle.revision_conflict",
      "skilllifecycle.submission_conflict",
      "skilllifecycle.local_source_changed",
    ].includes(caught.code)) await loadDetail();
  } finally {
    if (epoch === operationEpoch) operationBusy.value = false;
  }
}

async function pollOperation(operationId: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const operation = await skillAdapter.querySkillOperation({ operationId });
    if (operation.state === "succeeded") {
      operationTone.value = "neutral";
      operationMessage.value = operation.operationKind === "draft_test"
        ? "当前保存版本测试通过。"
        : operation.operationKind === "install" ? "技能安装完成。" : "技能卸载完成。";
      return;
    }
    if (operation.state === "failed") {
      operationTone.value = "danger";
      operationMessage.value = operation.safeReason ?? "技能操作未能完成。";
      return;
    }
    await delay(750);
  }
  operationTone.value = "warning";
  operationMessage.value = "技能操作仍在进行，请稍后刷新查看。";
}

function isCurrent(epoch: number, currentSection: DetailSection, currentId: string): boolean {
  return epoch === requestEpoch && section.value === currentSection && resourceId.value === currentId;
}

async function returnToCatalog(): Promise<void> {
  await router.push({ name: "intelligence", query: { section: section.value } });
}

function resourceNames(resources: readonly ResourceView[]): string {
  return resources.length === 0
    ? "未提供"
    : resources.map((resource) => `${resource.name}（${resource.availabilityLabel}）`).join("，");
}

function parseScope(value: unknown): SkillListScope {
  return value === "installed" || value === "local" || value === "created"
    ? value
    : "marketplace";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
</script>

<style scoped>
.intelligence-detail {
  width: min(100%, 1040px);
  margin: 0 auto;
  padding: 30px 28px 48px;
  display: grid;
  align-content: start;
  gap: 16px;
}

.intelligence-detail__back {
  justify-self: start;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  padding: 0 8px;
  background: transparent;
  color: var(--r3-color-text-secondary);
}
.intelligence-detail__back:hover { background: var(--r3-color-surface-hover); color: var(--r3-color-text); }
.intelligence-detail__back:focus-visible { outline: 2px solid var(--r3-color-focus); outline-offset: 2px; }

.intelligence-detail__page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 2px 12px;
}
.intelligence-detail__page-header > div { display: grid; gap: 5px; }
.intelligence-detail__page-header p { margin: 0; color: var(--r3-color-primary); font-size: 12px; font-weight: 700; }
.intelligence-detail__page-header h2 { margin: 0; font-size: 28px; font-weight: 650; }
.intelligence-detail__page-header span { color: var(--r3-color-text-secondary); font-size: 13px; }
.intelligence-detail__loading { display: grid; gap: 12px; }

.intelligence-detail__hero { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 16px; align-items: start; }
.intelligence-detail__avatar { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 12px; background: #edf1f7; color: #43516a; font-weight: 750; }
.intelligence-detail__identity { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.intelligence-detail__identity h3 { margin: 0 4px 0 0; font-size: 19px; }
.intelligence-detail__hero p { margin: 8px 0 0; color: var(--r3-color-text-secondary); line-height: 1.7; }
.intelligence-detail__sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
.intelligence-detail__sections h3 { margin: 0; font-size: 14px; }
.intelligence-detail__facts { display: grid; gap: 0; margin: 0; }
.intelligence-detail__facts div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--r3-color-border); }
.intelligence-detail__facts div:last-child { border-bottom: 0; }
.intelligence-detail__facts dt { color: var(--r3-color-text-secondary); }
.intelligence-detail__facts dt, .intelligence-detail__facts dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.intelligence-detail__markdown { margin: 0; max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.65; color: var(--r3-color-text-secondary); }
.intelligence-detail__skill-actions { display: grid; gap: 14px; }
.intelligence-detail__submit-fields { display: grid; grid-template-columns: minmax(140px, 0.35fr) minmax(0, 1fr); gap: 12px; }
.intelligence-detail__action-row { display: flex; flex-wrap: wrap; gap: 8px; }
.intelligence-detail__hint { margin: 0; color: var(--r3-color-text-secondary); font-size: 12px; }

@media (max-width: 800px) {
  .intelligence-detail { padding: 22px 18px 36px; }
  .intelligence-detail__sections { grid-template-columns: 1fr; }
  .intelligence-detail__submit-fields { grid-template-columns: 1fr; }
}
</style>
