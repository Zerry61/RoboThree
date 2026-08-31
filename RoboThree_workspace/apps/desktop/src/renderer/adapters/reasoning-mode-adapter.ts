import type {
  ReasoningModePreferenceProjectionV1Alpha5,
  ReasoningModePreferenceReceiptV1Alpha5,
  ReasoningModePreviewV1Alpha5,
  SubmitTurnReceiptV1Alpha5,
} from "@robothree/contracts/desktop-local/v1alpha5";
import type { TaskAuthorizationMode } from "@robothree/contracts";
import type { TaskReasoningModeProjectionV1Alpha1 } from
  "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";
import type { InjectionKey } from "vue";

import type {
  RoboThreeDesktopApiV1Alpha5,
  RoboThreeDesktopTaskReasoningApiV1Alpha1,
} from "../../shared/foundation-api.js";

export type ReasoningCompatibility = Readonly<{
  state: "available" | "unavailable";
  reasonCode: "ready" | "production_gate_disabled" | "runtime_dependencies_unavailable";
  runtimeInstanceId?: string;
}>;

export type ReasoningSubmitDraft = Readonly<{
  requestedMode: "default" | "max";
  preview?: Pick<ReasoningModePreviewV1Alpha5,
    "effectiveModelId" | "maxSupport" | "maxSupportRevision">;
}>;

const clientInstanceId = randomId();

export class ReasoningModeAdapter {
  readonly #api: RoboThreeDesktopApiV1Alpha5 | undefined;
  readonly #taskApi: RoboThreeDesktopTaskReasoningApiV1Alpha1 | undefined;
  #runtimeInstanceId: string | undefined;
  #previewGeneration = 0;

  public constructor(input: Readonly<{
    api: RoboThreeDesktopApiV1Alpha5 | undefined;
    taskApi: RoboThreeDesktopTaskReasoningApiV1Alpha1 | undefined;
  }>) {
    this.#api = input.api;
    this.#taskApi = input.taskApi;
  }

  public async negotiate(): Promise<ReasoningCompatibility> {
    if (this.#api === undefined) {
      this.#runtimeInstanceId = undefined;
      return { state: "unavailable", reasonCode: "production_gate_disabled" };
    }
    const result = await this.#api.getCompatibility({
      contractVersion: "v1alpha5",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      supportedContractVersions: ["v1alpha5", "v1alpha4", "v1alpha3", "v1alpha2", "v1alpha1"],
    });
    if (!result.ok) {
      this.#runtimeInstanceId = undefined;
      return { state: "unavailable", reasonCode: "runtime_dependencies_unavailable" };
    }
    this.#runtimeInstanceId = result.value.runtimeInstanceId;
    const feature = result.value.features.find((item) =>
      item.feature === "max_reasoning_mode_core");
    if (feature === undefined) {
      this.#runtimeInstanceId = undefined;
      return { state: "unavailable", reasonCode: "runtime_dependencies_unavailable" };
    }
    return {
      state: feature.state,
      reasonCode: feature.reasonCode,
      runtimeInstanceId: result.value.runtimeInstanceId,
    };
  }

  public async loadPreference(): Promise<ReasoningModePreferenceProjectionV1Alpha5> {
    const api = this.#requireApi();
    const result = await api.getReasoningModePreference({
      contractVersion: "v1alpha5",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "get_reasoning_mode_preference",
    });
    return accept(result);
  }

  public async preview(input: Readonly<{
    agentId: string;
    requestedModelId?: string;
  }>): Promise<Readonly<{
    generation: number;
    value?: ReasoningModePreviewV1Alpha5;
    stale: boolean;
  }>> {
    const generation = ++this.#previewGeneration;
    const runtimeInstanceId = this.#runtimeInstanceId;
    const result = await this.#requireApi().previewReasoningMode({
      contractVersion: "v1alpha5",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "preview_reasoning_mode",
      agentId: input.agentId,
      ...(input.requestedModelId === undefined || input.requestedModelId === ""
        ? {}
        : { requestedModelId: input.requestedModelId }),
    });
    const stale = generation !== this.#previewGeneration
      || runtimeInstanceId !== this.#runtimeInstanceId;
    return stale
      ? { generation, stale: true }
      : { generation, stale: false, value: accept(result) };
  }

  public invalidatePreview(): void {
    this.#previewGeneration += 1;
  }

  public async savePreference(input: Readonly<{
    requestedMode: "default" | "max";
    expectedRevision: number;
    commandId: string;
  }>): Promise<ReasoningModePreferenceReceiptV1Alpha5> {
    const result = await this.#requireApi().updateReasoningModePreference({
      contractVersion: "v1alpha5",
      commandId: input.commandId,
      correlationId: randomId(),
      clientInstanceId,
      type: "update_reasoning_mode_preference",
      expectedPreferenceRevision: input.expectedRevision,
      requestedMode: input.requestedMode,
    });
    return accept(result);
  }

  public async submitTask(input: Readonly<{
    commandId: string;
    clientTurnId: string;
    sessionId: string;
    userInput: string;
    agentId: string;
    requestedModelId?: string;
    selectedSkillIds: readonly string[];
    selectedKnowledgeIds: readonly string[];
    workspaceGrantId?: string;
    reasoning: ReasoningSubmitDraft;
    authorizationMode: TaskAuthorizationMode;
  }>): Promise<SubmitTurnReceiptV1Alpha5> {
    const reasoningPreference = input.reasoning.requestedMode === "default"
      ? { requestedMode: "default" as const }
      : exactMaxPreference(input.reasoning, input.requestedModelId);
    return accept(await this.#requireApi().submitTurn({
      contractVersion: "v1alpha5",
      commandId: input.commandId,
      correlationId: randomId(),
      clientInstanceId,
      type: "submit_turn",
      clientTurnId: input.clientTurnId,
      sessionId: input.sessionId,
      userInput: input.userInput,
      selectionRequest: {
        agentId: input.agentId,
        ...(input.requestedModelId === undefined || input.requestedModelId === ""
          ? {}
          : { requestedModelId: input.requestedModelId }),
        selectedSkillIds: [...input.selectedSkillIds],
        selectedKnowledgeIds: [...input.selectedKnowledgeIds],
        ...(input.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: input.workspaceGrantId }),
        authorizationPreference: {
          schemaVersion: "v1alpha1",
          requestedMode: input.authorizationMode,
        },
        reasoningPreference,
      },
    }));
  }

  public async recoverSubmit(input: Readonly<{
    submitTurnCommandId: string;
  }>): Promise<SubmitTurnReceiptV1Alpha5> {
    return accept(await this.#requireApi().getSubmitTurnStatus({
      contractVersion: "v1alpha5",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "submit_turn_status",
      submitTurnCommandId: input.submitTurnCommandId,
    }));
  }

  public async loadTaskReasoning(input: Readonly<{
    taskId: string;
  }>): Promise<TaskReasoningModeProjectionV1Alpha1> {
    if (this.#taskApi === undefined) {
      throw new ReasoningModeAdapterError("任务推理摘要暂不可用。", "unavailable");
    }
    return accept(await this.#taskApi.getTaskReasoningMode({
      contractVersion: "task-reasoning.v1alpha1",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "get_task_reasoning_mode",
      taskId: input.taskId,
    }));
  }

  #requireApi(): RoboThreeDesktopApiV1Alpha5 {
    if (this.#api === undefined || this.#runtimeInstanceId === undefined) {
      throw new ReasoningModeAdapterError("Max 推理当前不可用。", "unavailable");
    }
    return this.#api;
  }
}

export const reasoningModeAdapterKey: InjectionKey<ReasoningModeAdapter> =
  Symbol("RoboThreeReasoningModeAdapter");

const desktopWindow = typeof window === "undefined" ? undefined : window;

export const desktopReasoningModeAdapter = new ReasoningModeAdapter({
  api: (desktopWindow as (Window & {
    robothreeDesktopV1Alpha5?: RoboThreeDesktopApiV1Alpha5;
  }) | undefined)?.robothreeDesktopV1Alpha5,
  taskApi: (desktopWindow as (Window & {
    robothreeDesktopTaskReasoningV1Alpha1?: RoboThreeDesktopTaskReasoningApiV1Alpha1;
  }) | undefined)?.robothreeDesktopTaskReasoningV1Alpha1,
});

function exactMaxPreference(
  reasoning: ReasoningSubmitDraft,
  requestedModelId: string | undefined,
) {
  const preview = reasoning.preview;
  if (preview === undefined
    || requestedModelId === undefined
    || preview.effectiveModelId !== requestedModelId) {
    throw new ReasoningModeAdapterError(
      "当前模型尚未完成 Max 支持检查，请改用模型默认模式。",
      "stale_preview",
    );
  }
  return {
    requestedMode: "max" as const,
    observedMaxSupport: preview.maxSupport,
    observedMaxSupportRevision: preview.maxSupportRevision,
  };
}

function accept<T>(result: Readonly<{
  ok: boolean;
  value?: T;
  error?: Readonly<{ code: string; safeSummary: string }>;
}>): T {
  if (!result.ok || result.value === undefined) {
    throw new ReasoningModeAdapterError(
      result.error?.safeSummary ?? "Max 推理操作失败。",
      result.error?.code ?? "internal",
    );
  }
  return result.value;
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export class ReasoningModeAdapterError extends Error {
  public readonly code: string;

  public constructor(message: string, code: string) {
    super(message);
    this.name = "ReasoningModeAdapterError";
    this.code = code;
  }
}
