<template>
  <section class="skill-catalog" aria-label="技能目录">
    <nav class="skill-catalog__tabs" aria-label="技能分类">
      <button
        v-for="tab in skillScopeTabs"
        :key="tab.value"
        type="button"
        :aria-current="scope === tab.value ? 'page' : undefined"
        @click="void selectScope(tab.value)"
      >{{ tab.label }}</button>
    </nav>

    <div class="skill-catalog__toolbar">
      <R3SearchField
        v-model="searchQuery"
        accessible-label="筛选已加载技能"
        placeholder="筛选已加载技能"
        :disabled="state.status !== 'ready'"
      />
      <R3Button variant="secondary" :loading="state.status === 'loading'" @click="void loadScope(scope)">
        刷新
      </R3Button>
    </div>

    <R3InlineNotice
      v-if="state.status === 'unavailable' || state.status === 'error'"
      :tone="state.status === 'error' ? 'danger' : 'warning'"
      :title="state.status === 'error' ? '技能目录加载失败' : '技能服务暂不可用'"
    >{{ state.message }}</R3InlineNotice>

    <div v-else-if="state.status === 'loading'" class="skill-catalog__loading" aria-label="正在加载技能">
      <R3Skeleton />
      <R3Skeleton />
      <R3Skeleton />
    </div>

    <R3EmptyState
      v-else-if="visibleSkills.length === 0"
      icon="S"
      :title="searchQuery.trim() === '' ? emptyTitle : '没有匹配的技能'"
      :description="searchQuery.trim() === '' ? emptyDescription : '搜索只筛选当前已经加载的技能。'"
    />

    <template v-else>
      <ul class="skill-catalog__grid" :aria-label="activeScopeLabel">
        <li v-for="skill in visibleSkills" :key="`${skill.skillId}:${skill.revision}`">
          <button type="button" class="skill-catalog__card" @click="void openSkill(skill)">
            <span class="skill-catalog__icon" aria-hidden="true">S</span>
            <span class="skill-catalog__content">
              <span class="skill-catalog__identity">
                <strong>{{ presentSkillSummary(skill).title }}</strong>
                <R3Tag tone="neutral">{{ presentSkillSummary(skill).availabilityLabel }}</R3Tag>
              </span>
              <small>{{ presentSkillSummary(skill).technicalName }}</small>
              <span>{{ presentSkillSummary(skill).description }}</span>
              <span class="skill-catalog__meta">
                {{ presentSkillSummary(skill).sourceLabel }}
                <template v-if="presentSkillSummary(skill).creatorLabel"> · {{ presentSkillSummary(skill).creatorLabel }}</template>
                · {{ presentSkillSummary(skill).versionLabel }}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <div v-if="state.nextCursor" class="skill-catalog__pagination">
        <R3Button variant="secondary" :loading="state.loadingMore" @click="void loadMore()">
          加载更多
        </R3Button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type {
  SkillListScope,
  SkillSummary,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";
import { computed, inject, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  skillLifecycleAdapterKey,
  SkillLifecycleAdapterError,
  unavailableSkillLifecycleAdapter,
} from "../../adapters/skill-lifecycle-adapter.js";
import {
  presentSkillLifecycleError,
  presentSkillSummary,
  skillScopeTabs,
} from "../../presentation/skill-lifecycle-presentation.js";
import {
  R3Button,
  R3EmptyState,
  R3InlineNotice,
  R3SearchField,
  R3Skeleton,
  R3Tag,
} from "../../components/ui";

type SkillCatalogState = {
  status: "loading" | "ready" | "unavailable" | "error";
  message: string;
  queryRevision?: string;
  nextCursor?: string;
  loadingMore: boolean;
};

const adapter = inject(skillLifecycleAdapterKey, unavailableSkillLifecycleAdapter);
const route = useRoute();
const router = useRouter();
const scope = ref<SkillListScope>(parseScope(route.query.scope));
const searchQuery = ref("");
const skills = ref<SkillSummary[]>([]);
const state = reactive<SkillCatalogState>({
  status: "loading",
  message: "",
  loadingMore: false,
});
let requestEpoch = 0;

const visibleSkills = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase("zh-CN");
  if (query === "") return skills.value;
  return skills.value.filter((skill) => [
    skill.displayTitle,
    skill.technicalName,
    skill.displayDescription,
    skill.creatorDisplayName ?? "",
  ].join(" ").toLocaleLowerCase("zh-CN").includes(query));
});
const activeScopeLabel = computed(() => skillScopeTabs.find((tab) => tab.value === scope.value)?.label ?? "技能");
const emptyTitle = computed(() => ({
  marketplace: "技能广场暂无可安装技能",
  installed: "尚未安装技能",
  local: "没有发现本地技能",
  created: "还没有创建技能",
})[scope.value]);
const emptyDescription = computed(() => ({
  marketplace: "企业发布的可见技能会显示在这里。",
  installed: "从技能广场安装后，技能会显示在这里。",
  local: "当前工作区或用户技能目录中没有可用技能。",
  created: "创建并保存技能后，它会显示在这里。",
})[scope.value]);

onMounted(() => void loadScope(scope.value));

async function selectScope(nextScope: SkillListScope): Promise<void> {
  if (scope.value === nextScope) return;
  scope.value = nextScope;
  searchQuery.value = "";
  await router.replace({
    name: "intelligence",
    query: { ...route.query, section: "skills", scope: nextScope },
  });
  await loadScope(nextScope);
}

async function loadScope(targetScope: SkillListScope): Promise<void> {
  const epoch = ++requestEpoch;
  state.status = "loading";
  state.message = "";
  state.nextCursor = undefined;
  state.queryRevision = undefined;
  skills.value = [];
  try {
    const compatibility = await adapter.getSkillLifecycleCompatibility();
    if (epoch !== requestEpoch || targetScope !== scope.value) return;
    if (!compatibility.serviceAvailable || !scopeAvailable(targetScope, compatibility)) {
      state.status = "unavailable";
      state.message = "当前技能分类尚未接入真实服务，不会展示示例数据。";
      return;
    }
    const page = await adapter.listSkills({ scope: targetScope, limit: 50 });
    if (epoch !== requestEpoch || targetScope !== scope.value) return;
    skills.value = [...page.items];
    state.queryRevision = page.queryRevision;
    state.nextCursor = page.nextCursor;
    state.status = "ready";
  } catch (caught) {
    if (epoch !== requestEpoch || targetScope !== scope.value) return;
    state.status = caught instanceof SkillLifecycleAdapterError
      && caught.code === "skilllifecycle.service_unavailable" ? "unavailable" : "error";
    state.message = presentSkillLifecycleError(caught instanceof SkillLifecycleAdapterError
      ? { code: caught.code, safeSummary: caught.safeSummary }
      : {});
  }
}

async function loadMore(): Promise<void> {
  const cursor = state.nextCursor;
  const queryRevision = state.queryRevision;
  if (cursor === undefined || queryRevision === undefined || state.loadingMore) return;
  state.loadingMore = true;
  try {
    const page = await adapter.listSkills({ scope: scope.value, cursor, limit: 50 });
    if (page.queryRevision !== queryRevision) {
      await loadScope(scope.value);
      return;
    }
    const existing = new Set(skills.value.map((skill) => `${skill.skillId}:${skill.revision}`));
    skills.value = [...skills.value, ...page.items.filter((skill) =>
      !existing.has(`${skill.skillId}:${skill.revision}`))];
    state.nextCursor = page.nextCursor;
  } catch (caught) {
    state.status = "error";
    state.message = presentSkillLifecycleError(caught instanceof SkillLifecycleAdapterError
      ? { code: caught.code, safeSummary: caught.safeSummary }
      : {});
  } finally {
    state.loadingMore = false;
  }
}

async function openSkill(skill: SkillSummary): Promise<void> {
  await router.push({
    name: "intelligenceSkillDetail",
    params: { skillId: skill.skillId },
    query: { scope: scope.value, sourceKind: skill.sourceKind },
  });
}

function parseScope(value: unknown): SkillListScope {
  return skillScopeTabs.some((tab) => tab.value === value)
    ? value as SkillListScope
    : "marketplace";
}

function scopeAvailable(
  targetScope: SkillListScope,
  compatibility: Awaited<ReturnType<typeof adapter.getSkillLifecycleCompatibility>>,
): boolean {
  switch (targetScope) {
    case "marketplace": return compatibility.marketplaceAvailable;
    case "created": return compatibility.creatorAvailable;
    case "installed": return compatibility.installationAvailable;
    case "local": return compatibility.serviceAvailable;
  }
}
</script>

<style scoped>
.skill-catalog { display: grid; gap: 16px; }
.skill-catalog__tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--r3-color-border); }
.skill-catalog__tabs button { min-height: 38px; border: 0; border-bottom: 2px solid transparent; padding: 0 14px; background: transparent; color: var(--r3-color-text-secondary); font-weight: 600; }
.skill-catalog__tabs button[aria-current="page"] { border-bottom-color: var(--r3-color-primary); color: var(--r3-color-text); }
.skill-catalog__tabs button:focus-visible { outline: 2px solid var(--r3-color-focus); outline-offset: 2px; }
.skill-catalog__toolbar { display: flex; justify-content: space-between; gap: 12px; }
.skill-catalog__toolbar > :first-child { flex: 1; }
.skill-catalog__loading { display: grid; gap: 10px; }
.skill-catalog__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.skill-catalog__card { width: 100%; min-height: 132px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 16px; gap: 12px; align-items: start; border: 1px solid var(--r3-color-border); border-radius: 8px; padding: 15px; background: var(--r3-color-surface); color: inherit; text-align: left; }
.skill-catalog__card:hover { border-color: var(--r3-color-primary); background: var(--r3-color-surface-hover); }
.skill-catalog__card:focus-visible { outline: 2px solid var(--r3-color-focus); outline-offset: 2px; }
.skill-catalog__icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 8px; background: #edf1f7; color: #43516a; font-weight: 750; }
.skill-catalog__content { min-width: 0; display: grid; gap: 5px; }
.skill-catalog__identity { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.skill-catalog__content strong, .skill-catalog__content small, .skill-catalog__content > span { overflow-wrap: anywhere; }
.skill-catalog__content small, .skill-catalog__meta { color: var(--r3-color-text-secondary); font-size: 12px; }
.skill-catalog__content > span:not(.skill-catalog__identity):not(.skill-catalog__meta) { font-size: 13px; line-height: 1.55; }
.skill-catalog__pagination { display: flex; justify-content: center; }
@media (max-width: 780px) { .skill-catalog__grid { grid-template-columns: 1fr; } }
</style>
