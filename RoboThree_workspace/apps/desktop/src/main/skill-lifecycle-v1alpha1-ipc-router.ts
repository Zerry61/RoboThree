import {
  CreateSkillDraftWorkspaceCommandSchema,
  GetSkillLifecycleCompatibilityQuerySchema,
  GetSkillQuerySchema,
  InstallSkillReleaseCommandSchema,
  ListSkillsQuerySchema,
  QuerySkillOperationSchema,
  RefreshSkillDraftCommandSchema,
  SkillLifecycleSafeErrorSchema,
  StartSkillDraftTestCommandSchema,
  SubmitSkillDraftCommandSchema,
  UninstallSkillReleaseCommandSchema,
  WithdrawSkillSubmissionCommandSchema,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";
import type { IpcMainInvokeEvent } from "electron";

import {
  SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  type RendererSkillLifecycleSafeResult,
  type SkillLifecycleV1Alpha1InvokeChannel,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";
import type { SkillDraftWorkspaceService } from "./skill-draft-workspace-service.js";
import type { SkillInstallationService } from "./skill-installation-service.js";
import type { SkillLocalDiscoveryService } from "./skill-local-discovery-service.js";

export class SkillLifecycleV1Alpha1IpcRouter {
  constructor(private readonly input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
    isAuthorizedWebContents: (webContentsId: number) => boolean;
    draftWorkspaces: SkillDraftWorkspaceService;
    installations: SkillInstallationService;
    localDiscovery: SkillLocalDiscoveryService;
  }>) {}

  async dispatch(channel: SkillLifecycleV1Alpha1InvokeChannel, raw: unknown,
    event: IpcMainInvokeEvent): Promise<RendererSkillLifecycleSafeResult<unknown>> {
    try {
      if (event.senderFrame !== event.sender.mainFrame
        || !this.input.isAuthorizedWebContents(event.sender.id)) {
        return fail("skilllifecycle.unauthorized", raw);
      }
      const lease = this.input.resolveConnection();
      if (!this.input.isCurrentConnection(lease)) {
        return fail("skilllifecycle.service_unavailable", raw);
      }
      switch (channel) {
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getSkillLifecycleCompatibility:
          return lease.client.getSkillLifecycleCompatibilityV1Alpha1(
            GetSkillLifecycleCompatibilityQuerySchema.parse(raw));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.listSkills:
          {
            const query = ListSkillsQuerySchema.parse(raw);
            if (query.scope === "installed") {
              return success(await this.input.installations.listInstalled(query));
            }
            if (query.scope === "local") {
              return success(await this.input.localDiscovery.list(query, lease.client));
            }
            const result = await lease.client.listSkillsV1Alpha1(query);
            if (!result.ok || query.scope !== "marketplace") return result;
            return success(await this.input.installations.annotateMarketplace(result.value));
          }
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getSkill:
          {
            const query = GetSkillQuerySchema.parse(raw);
            if (query.sourceKind === "local_user_directory"
              || query.sourceKind === "local_workspace_directory") {
              return success(await this.input.localDiscovery.get(query, lease.client));
            }
            try {
              return success(await this.input.installations.getInstalled(query));
            } catch {
              return lease.client.getSkillV1Alpha1(query);
            }
          }
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.startSkillDraftTest:
          return lease.client.startSkillDraftTestV1Alpha1(
            StartSkillDraftTestCommandSchema.parse(raw));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.submitSkillDraft:
          return lease.client.submitSkillDraftV1Alpha1(SubmitSkillDraftCommandSchema.parse(raw));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.withdrawSkillSubmission:
          return lease.client.withdrawSkillSubmissionV1Alpha1(
            WithdrawSkillSubmissionCommandSchema.parse(raw));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.createSkillDraftWorkspace:
          return success(await this.input.draftWorkspaces.create(
            CreateSkillDraftWorkspaceCommandSchema.parse(raw), {
              client: lease.client,
              clientInstanceId: lease.transportClientInstanceId,
            }));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.refreshSkillDraft:
          return success(await this.input.draftWorkspaces.refresh(
            RefreshSkillDraftCommandSchema.parse(raw), { client: lease.client }));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.installSkillRelease:
          return success(await this.input.installations.install(
            InstallSkillReleaseCommandSchema.parse(raw), {
              client: lease.client,
              clientInstanceId: lease.transportClientInstanceId,
            }));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.uninstallSkillRelease:
          return success(await this.input.installations.uninstall(
            UninstallSkillReleaseCommandSchema.parse(raw), { client: lease.client }));
        case SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.querySkillOperation:
          return success(await this.input.installations.query(QuerySkillOperationSchema.parse(raw)));
      }
    } catch (error) {
      const safe = SkillLifecycleSafeErrorSchema.safeParse(error);
      if (safe.success) return { ok: false, error: safe.data };
      if (error instanceof Error && error.message.startsWith("skilllifecycle.")) {
        const projected = projectLocalError(error.message, raw);
        if (projected !== undefined) return projected;
      }
      return fail("skilllifecycle.invalid_request", raw);
    }
  }
}

function projectLocalError(errorCode: string, raw: unknown): RendererSkillLifecycleSafeResult<never>
  | undefined {
  const allowed = SkillLifecycleSafeErrorSchema.shape.errorCode.safeParse(errorCode);
  if (!allowed.success) return undefined;
  const correlationId = typeof raw === "object" && raw !== null
    && "correlationId" in raw && typeof raw.correlationId === "string"
    ? raw.correlationId : "00000000-0000-4000-8000-000000000000";
  const summaries: Partial<Record<typeof allowed.data, string>> = {
    "skilllifecycle.not_found": "未找到对应的技能。",
    "skilllifecycle.revision_conflict": "技能状态已变化，请刷新后重试。",
    "skilllifecycle.installation_conflict": "技能安装状态冲突，请刷新后重试。",
    "skilllifecycle.active_task_lock": "仍有进行中的任务正在使用该技能，暂时不能卸载。",
    "skilllifecycle.package_invalid": "技能包无效，无法安装。",
    "skilllifecycle.operation_failed": "技能操作失败，请重试。",
  };
  return { ok: false, error: {
    contractVersion: "skill-lifecycle.v1alpha1",
    errorCode: allowed.data,
    safeSummary: summaries[allowed.data] ?? "技能操作失败，请刷新后重试。",
    correlationId,
    retryable: allowed.data === "skilllifecycle.service_unavailable",
  } };
}

function success<T>(value: T) {
  return { ok: true as const, value };
}

function fail(errorCode: "skilllifecycle.invalid_request" | "skilllifecycle.unauthorized"
  | "skilllifecycle.service_unavailable", raw: unknown) {
  const correlationId = typeof raw === "object" && raw !== null
    && "correlationId" in raw && typeof raw.correlationId === "string"
    ? raw.correlationId
    : "00000000-0000-4000-8000-000000000000";
  return {
    ok: false as const,
    error: {
      contractVersion: "skill-lifecycle.v1alpha1" as const,
      errorCode,
      safeSummary: errorCode === "skilllifecycle.invalid_request"
        ? "技能请求无效，请检查后重试。"
        : errorCode === "skilllifecycle.unauthorized"
          ? "当前窗口无权访问技能服务。"
          : "技能服务暂时不可用，请稍后重试。",
      correlationId,
      retryable: errorCode === "skilllifecycle.service_unavailable",
    },
  };
}
