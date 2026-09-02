import type {
  CreateSkillDraftWorkspaceCommand,
  CreateSkillDraftWorkspaceReceipt,
  DesktopSkillLifecycleApiV1Alpha1,
  GetSkillQuery,
  InstallSkillReleaseCommand,
  ListSkillsQuery,
  QuerySkillOperation,
  RefreshSkillDraftCommand,
  SkillDetail,
  SkillLifecycleCompatibility,
  SkillLifecycleMutationReceipt,
  SkillLifecycleSafeError,
  SkillOperation,
  SkillPage,
  StartSkillDraftTestCommand,
  SubmitSkillDraftCommand,
  SubmitSkillDraftReceipt,
  UninstallSkillReleaseCommand,
  WithdrawSkillSubmissionCommand,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";
import { SkillLifecycleSafeErrorSchema } from
  "@robothree/contracts/skill-lifecycle/v1alpha1";
import type { InjectionKey } from "vue";

declare global {
  interface Window {
    readonly robothreeSkillLifecycleV1Alpha1?: DesktopSkillLifecycleApiV1Alpha1;
  }
}

export type SkillLifecycleAdapter = Readonly<{
  getSkillLifecycleCompatibility(): Promise<SkillLifecycleCompatibility>;
  listSkills(input: Pick<ListSkillsQuery, "scope" | "cursor" | "limit">): Promise<SkillPage>;
  getSkill(input: Pick<GetSkillQuery, "skillId" | "revision" | "sourceKind">): Promise<SkillDetail>;
  createSkillDraftWorkspace(
    input: Pick<CreateSkillDraftWorkspaceCommand, "displayTitle" | "displayDescription" | "primaryFunction">,
  ): Promise<CreateSkillDraftWorkspaceReceipt>;
  refreshSkillDraft(
    input: Pick<RefreshSkillDraftCommand, "skillId" | "expectedDraftRevision">,
  ): Promise<SkillLifecycleMutationReceipt>;
  startSkillDraftTest(
    input: Pick<StartSkillDraftTestCommand, "skillId" | "expectedDraftRevision" | "testInput">,
  ): Promise<SkillLifecycleMutationReceipt>;
  submitSkillDraft(
    input: Pick<SubmitSkillDraftCommand, "skillId" | "expectedDraftRevision" | "semanticVersion" | "changeSummary">,
  ): Promise<SubmitSkillDraftReceipt>;
  withdrawSkillSubmission(
    input: Pick<WithdrawSkillSubmissionCommand, "skillId" | "submissionId" | "expectedSubmissionRevision">,
  ): Promise<SkillLifecycleMutationReceipt>;
  installSkillRelease(
    input: Pick<InstallSkillReleaseCommand, "skillId" | "releaseRevision" | "packageDigest" | "mode">,
  ): Promise<SkillLifecycleMutationReceipt>;
  uninstallSkillRelease(
    input: Pick<UninstallSkillReleaseCommand, "skillId" | "releaseRevision" | "expectedInstallationRevision">,
  ): Promise<SkillLifecycleMutationReceipt>;
  querySkillOperation(input: Pick<QuerySkillOperation, "operationId">): Promise<SkillOperation>;
}>;

export const skillLifecycleAdapterKey: InjectionKey<SkillLifecycleAdapter> =
  Symbol("RoboThreeSkillLifecycleAdapter");

export function createSkillLifecycleAdapter(
  api: DesktopSkillLifecycleApiV1Alpha1 | undefined,
): SkillLifecycleAdapter {
  return {
    async getSkillLifecycleCompatibility() {
      if (api === undefined) return unavailableCompatibility();
      return accept(api.getSkillLifecycleCompatibility(queryMeta(
        "get_skill_lifecycle_compatibility",
      )));
    },
    async listSkills(input) {
      return accept(requireApi(api).listSkills({
        ...queryMeta("list_skills"),
        scope: input.scope,
        limit: input.limit ?? 40,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      }));
    },
    async getSkill(input) {
      return accept(requireApi(api).getSkill({
        ...queryMeta("get_skill"),
        skillId: input.skillId,
        ...(input.revision === undefined ? {} : { revision: input.revision }),
        ...(input.sourceKind === undefined ? {} : { sourceKind: input.sourceKind }),
      }));
    },
    async createSkillDraftWorkspace(input) {
      return accept(requireApi(api).createSkillDraftWorkspace({
        ...commandMeta("create_skill_draft_workspace"),
        ...input,
      }));
    },
    async refreshSkillDraft(input) {
      return accept(requireApi(api).refreshSkillDraft({
        ...commandMeta("refresh_skill_draft"),
        ...input,
      }));
    },
    async startSkillDraftTest(input) {
      return accept(requireApi(api).startSkillDraftTest({
        ...commandMeta("start_skill_draft_test"),
        ...input,
      }));
    },
    async submitSkillDraft(input) {
      return accept(requireApi(api).submitSkillDraft({
        ...commandMeta("submit_skill_draft"),
        ...input,
        publicationScope: "enterprise",
      }));
    },
    async withdrawSkillSubmission(input) {
      return accept(requireApi(api).withdrawSkillSubmission({
        ...commandMeta("withdraw_skill_submission"),
        ...input,
      }));
    },
    async installSkillRelease(input) {
      return accept(requireApi(api).installSkillRelease({
        ...commandMeta("install_skill_release"),
        ...input,
      }));
    },
    async uninstallSkillRelease(input) {
      return accept(requireApi(api).uninstallSkillRelease({
        ...commandMeta("uninstall_skill_release"),
        ...input,
      }));
    },
    async querySkillOperation(input) {
      return accept(requireApi(api).querySkillOperation({
        ...queryMeta("query_skill_operation"),
        ...input,
      }));
    },
  };
}

export const unavailableSkillLifecycleAdapter = createSkillLifecycleAdapter(
  typeof window === "undefined" ? undefined : window.robothreeSkillLifecycleV1Alpha1,
);

export class SkillLifecycleAdapterError extends Error {
  readonly code: SkillLifecycleSafeError["errorCode"];
  readonly retryable: boolean;
  readonly safeSummary: string;

  constructor(error: SkillLifecycleSafeError) {
    super(error.safeSummary);
    this.name = "SkillLifecycleAdapterError";
    this.code = error.errorCode;
    this.retryable = error.retryable;
    this.safeSummary = error.safeSummary;
  }
}

function unavailableCompatibility(): SkillLifecycleCompatibility {
  return {
    contractVersion: "skill-lifecycle.v1alpha1",
    serviceAvailable: false,
    marketplaceAvailable: false,
    creatorAvailable: false,
    installationAvailable: false,
    testIdentityUsed: false,
    productionIdentityReady: false,
  };
}

function requireApi(
  api: DesktopSkillLifecycleApiV1Alpha1 | undefined,
): DesktopSkillLifecycleApiV1Alpha1 {
  if (api !== undefined) return api;
  throw unavailableError();
}

async function accept<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (caught) {
    const parsed = SkillLifecycleSafeErrorSchema.safeParse(caught);
    if (parsed.success) throw new SkillLifecycleAdapterError(parsed.data);
    throw unavailableError();
  }
}

function unavailableError(): SkillLifecycleAdapterError {
  return new SkillLifecycleAdapterError({
    contractVersion: "skill-lifecycle.v1alpha1",
    errorCode: "skilllifecycle.service_unavailable",
    safeSummary: "技能服务暂时不可用，请稍后重试。",
    correlationId: randomUuid(),
    retryable: true,
  });
}

function queryMeta<T extends string>(kind: T) {
  return {
    contractVersion: "skill-lifecycle.v1alpha1" as const,
    queryId: randomUuid(),
    correlationId: randomUuid(),
    kind,
  };
}

function commandMeta<T extends string>(kind: T) {
  return {
    contractVersion: "skill-lifecycle.v1alpha1" as const,
    commandId: randomUuid(),
    correlationId: randomUuid(),
    kind,
  };
}

function randomUuid(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000";
}
