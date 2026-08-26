import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import type {
  AgentProjection,
  ArtifactCatalogProjection,
  ArtifactCatalogItemProjection,
  ArtifactHtmlPreviewProjection,
  ArtifactLifecycleProjection,
  ArtifactPreviewMode,
  ArtifactProjection,
  ArtifactTextPreviewProjection,
  ConversationSnapshot,
  ModelProjection,
  RuntimeStatusProjection,
  SessionSummary,
  TaskDetailProjection,
  TaskSummaryProjection,
  TaskControlCommand,
  UserConfirmationProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

import type {
  RendererSafeResult,
  DesktopRendererEvent,
  RoboThreeDesktopApiV1Alpha1,
} from "../../shared/foundation-api.js";
import { explainDesktopError } from "../presentation/desktop-error-presentation.js";
import {
  canShowConfirmationDecisionActions,
  presentUserConfirmation,
} from "../presentation/user-confirmation-presentation.js";
import { presentComposer } from "../presentation/composer-presentation.js";
import {
  formatDisplayTime,
  shortDisplayId,
} from "../presentation/display-formatting.js";
import {
  presentDurableMessage,
  presentStreamingAssistant,
} from "../presentation/message-presentation.js";
import { presentArtifact } from "../presentation/artifact-presentation.js";
import {
  presentArtifactPreview,
  type ArtifactPreviewBlock,
} from "../presentation/artifact-preview-presentation.js";
import {
  presentShellRuntime,
  workspaceOptionLabel,
} from "../presentation/shell-presentation.js";
import {
  isTerminalTaskStatus,
  presentTaskStatus,
} from "../presentation/task-presentation.js";
import { presentToolActivity } from "../presentation/tool-activity-presentation.js";
import { createWorkspacePickerRequest } from "../workspace-picker-request.js";

// DCF-2C boundary marker: taskStatusGuidance covers waiting_confirmation, recovering, and manual_attention in presentation/task-presentation.ts.
declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
  }
}

type TaskControlIntent = TaskControlCommand extends infer Command
  ? Command extends TaskControlCommand
    ? Omit<Command,
      "contractVersion" | "commandId" | "correlationId" | "clientInstanceId">
    : never
  : never;

type ArtifactPanelItem = ArtifactProjection | ArtifactCatalogItemProjection;

const App = defineComponent({
  name: "RoboThreeWorkbench",
  setup() {
    const clientInstanceId = crypto.randomUUID();
    const runtime = ref<RuntimeStatusProjection>();
    const workspaces = ref<readonly WorkspaceGrantProjection[]>([]);
    const sessions = ref<readonly SessionSummary[]>([]);
    const agents = ref<readonly AgentProjection[]>([]);
    const models = ref<readonly ModelProjection[]>([]);
    const snapshot = ref<ConversationSnapshot>();
    const taskSummaries = ref<readonly TaskSummaryProjection[]>([]);
    const selectedTask = ref<TaskDetailProjection>();
    const artifactCatalog = ref<ArtifactCatalogProjection>();
    const selectedWorkspaceId = ref("");
    const selectedSessionId = ref("");
    const selectedAgentId = ref("");
    const requestedModelId = ref("");
    const composer = ref("");
    const busy = ref(false);
    const loading = ref(true);
    const error = ref("");
    const notice = ref("");
    const showToolPanel = ref(false);
    const showDeletedArtifacts = ref(false);
    const artifactPreview = ref<{
      artifactId: string;
      mode: ArtifactPreviewMode;
      status: "loading" | "ready" | "error";
      result?: ArtifactTextPreviewProjection;
      error?: string;
    }>();
    const artifactHtmlPreview = ref<{
      artifactId: string;
      status: "loading" | "ready" | "error";
      result?: ArtifactHtmlPreviewProjection;
      error?: string;
    }>();
    const artifactAction = ref<{
      artifactId: string;
      status: "running" | "error";
      error?: string;
    }>();
    const streamingAssistant = ref<{
      sessionId: string;
      messageId: string;
      runtimeInstanceId: string;
      lastDeltaSequence: number;
      text: string;
    }>();
    let unsubscribe: (() => void) | undefined;

    const selectedAgent = computed(() =>
      agents.value.find((agent) => agent.agentId === selectedAgentId.value));
    const selectedSession = computed(() =>
      sessions.value.find((session) => session.sessionId === selectedSessionId.value));
    const composerPresentation = computed(() => presentComposer({
      selectedAgent: selectedAgent.value,
      models: models.value,
      requestedModelId: requestedModelId.value,
      selectedWorkspaceId: selectedWorkspaceId.value,
      composerText: composer.value,
      busy: busy.value,
    }));
    const shellRuntimePresentation = computed(() =>
      presentShellRuntime(runtime.value));

    const queryMeta = () => ({
      contractVersion: "v1alpha1" as const,
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      clientInstanceId,
    });
    const commandMeta = () => ({
      contractVersion: "v1alpha1" as const,
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      clientInstanceId,
    });

    const defaultArtifactLifecycle = (): ArtifactLifecycleProjection => ({
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    });

    const artifactLifecycle = (
      artifact: ArtifactPanelItem,
    ): ArtifactLifecycleProjection =>
      artifact.lifecycle ?? defaultArtifactLifecycle();

    async function closeCurrentHtmlPreview(): Promise<void> {
      const current = artifactHtmlPreview.value;
      if (current?.result === undefined) {
        artifactHtmlPreview.value = undefined;
        return;
      }
      const previewSessionId = current.result.previewSessionId;
      artifactHtmlPreview.value = undefined;
      await window.robothreeDesktop.closeArtifactPreview({
        ...commandMeta(),
        type: "close_artifact_preview",
        previewSessionId,
      }).catch(() => undefined);
    }

    async function accept<T>(
      operation: Promise<RendererSafeResult<T>>,
    ): Promise<T | undefined> {
      const result = await operation;
      if (!result.ok) {
        error.value = explainDesktopError(result.error);
        return undefined;
      }
      error.value = "";
      return result.value;
    }

    async function refreshCatalogAndShell(): Promise<void> {
      loading.value = true;
      try {
        const [nextRuntime, nextWorkspaces, nextSessions, nextAgents, nextModels] =
          await Promise.all([
            accept(window.robothreeDesktop.getRuntimeStatus({
              ...queryMeta(),
              type: "runtime_status_query",
            })),
            accept(window.robothreeDesktop.listWorkspaceGrants({
              ...queryMeta(),
              type: "list_workspace_grants",
            })),
            accept(window.robothreeDesktop.listSessions({
              ...queryMeta(),
              type: "list_sessions",
            })),
            accept(window.robothreeDesktop.listAgents({
              ...queryMeta(),
              type: "list_agents",
            })),
            accept(window.robothreeDesktop.listModels({
              ...queryMeta(),
              type: "list_models",
            })),
          ]);
        if (nextRuntime !== undefined) runtime.value = nextRuntime;
        if (nextWorkspaces !== undefined) {
          workspaces.value = nextWorkspaces.filter((item) => item.status === "active");
          if (!workspaces.value.some((item) =>
            item.workspaceGrantId === selectedWorkspaceId.value)) {
            selectedWorkspaceId.value = workspaces.value[0]?.workspaceGrantId ?? "";
          }
        }
        if (nextSessions !== undefined) sessions.value = nextSessions;
        if (nextAgents !== undefined) {
          agents.value = nextAgents;
          if (!agents.value.some((item) => item.agentId === selectedAgentId.value)) {
            selectedAgentId.value =
              agents.value.find((item) => item.runnable)?.agentId ?? "";
          }
        }
        if (nextModels !== undefined) models.value = nextModels;
        await loadArtifactCatalog();
      } catch {
        error.value = "无法连接本地运行时，请稍后重试。";
      } finally {
        loading.value = false;
      }
    }

    async function chooseWorkspace(): Promise<void> {
      await guarded(async () => {
        const meta = commandMeta();
        const grant = await accept(
          window.robothreeDesktop.createWorkspaceGrantFromPicker(
            createWorkspacePickerRequest({
              contractVersion: meta.contractVersion,
              commandId: meta.commandId,
              correlationId: meta.correlationId,
              clientInstanceId: meta.clientInstanceId,
              displayName: "本地工作区",
              accessMode: "read_write",
            }),
          ),
        );
        if (grant === undefined) return;
        selectedWorkspaceId.value = grant.workspaceGrantId;
        notice.value = "工作目录已授权。";
        await refreshCatalogAndShell();
      });
    }

    async function registerWorkspaceArtifact(): Promise<void> {
      await guarded(async () => {
        const receipt = await accept(
          window.robothreeDesktop.registerWorkspaceArtifactFromPicker({
            ...commandMeta(),
            type: "register_workspace_artifact",
          }),
        );
        if (receipt === undefined) return;
        notice.value = receipt.status === "replayed"
          ? "Artifact registration replayed."
          : "Artifact registered.";
        await loadArtifactCatalog();
      });
    }

    async function revokeWorkspace(workspaceGrantId: string): Promise<void> {
      await guarded(async () => {
        const revoked = await accept(window.robothreeDesktop.revokeWorkspaceGrant({
          ...commandMeta(),
          type: "revoke_workspace_grant",
          workspaceGrantId,
        }));
        if (revoked === undefined) return;
        notice.value = "工作目录授权已撤销。";
        await refreshCatalogAndShell();
      });
    }

    async function createSession(): Promise<void> {
      await guarded(async () => {
        const session = await accept(window.robothreeDesktop.createSession({
          ...commandMeta(),
          type: "create_session",
          title: "新会话",
        }));
        if (session === undefined) return;
        sessions.value = [session, ...sessions.value];
        await openSession(session.sessionId);
      });
    }

    async function openSession(sessionId: string): Promise<void> {
      await guarded(async () => {
        const session = await accept(window.robothreeDesktop.openSession({
          ...queryMeta(),
          type: "open_session",
          sessionId,
        }));
        if (session === undefined) return;
        selectedSessionId.value = session.sessionId;
        streamingAssistant.value = undefined;
        selectedTask.value = undefined;
        artifactPreview.value = undefined;
        await closeCurrentHtmlPreview();
        await loadSnapshot(session.sessionId);
      }, false);
    }

    async function renameCurrentSession(): Promise<void> {
      const current = selectedSession.value;
      if (current === undefined) return;
      const title = window.prompt("会话名称", current.title)?.trim();
      if (!title || title === current.title) return;
      await guarded(async () => {
        const updated = await accept(window.robothreeDesktop.renameSession({
          ...commandMeta(),
          type: "rename_session",
          sessionId: current.sessionId,
          title,
          expectedRevision: current.revision,
        }));
        if (updated !== undefined) {
          sessions.value = sessions.value.map((item) =>
            item.sessionId === updated.sessionId ? updated : item);
        }
      });
    }

    async function deleteCurrentSession(): Promise<void> {
      const current = selectedSession.value;
      if (current === undefined || !window.confirm(`删除会话“${current.title}”？`)) return;
      await guarded(async () => {
        const deleted = await accept(window.robothreeDesktop.deleteSession({
          ...commandMeta(),
          type: "delete_session",
          sessionId: current.sessionId,
          expectedRevision: current.revision,
        }));
        if (deleted === undefined) return;
        sessions.value = sessions.value.filter((item) =>
          item.sessionId !== deleted.sessionId);
        selectedSessionId.value = "";
        snapshot.value = undefined;
        taskSummaries.value = [];
        selectedTask.value = undefined;
        artifactPreview.value = undefined;
        await closeCurrentHtmlPreview();
        streamingAssistant.value = undefined;
      });
    }

    async function loadSnapshot(sessionId = selectedSessionId.value): Promise<void> {
      if (!sessionId) return;
      const value = await accept(window.robothreeDesktop.loadConversationSnapshot({
        ...queryMeta(),
        type: "conversation_snapshot",
        sessionId,
        limit: 200,
      }));
      if (value !== undefined && sessionId === selectedSessionId.value) {
        snapshot.value = value;
        await loadTasks(sessionId);
      }
    }

    async function loadTasks(
      sessionId = selectedSessionId.value,
      taskId = selectedTask.value?.summary.taskId,
    ): Promise<void> {
      if (!sessionId) return;
      const next = await accept(window.robothreeDesktop.listTasks({
        ...queryMeta(),
        type: "list_tasks",
        sessionId,
        limit: 100,
      }));
      if (next === undefined || sessionId !== selectedSessionId.value) return;
      taskSummaries.value = next;
      const nextTaskId = taskId
        ?? next.find((item) => !isTerminalTaskStatus(item.displayStatus))?.taskId;
      if (nextTaskId === undefined) {
        selectedTask.value = undefined;
        artifactPreview.value = undefined;
        await closeCurrentHtmlPreview();
        return;
      }
      const detail = await accept(window.robothreeDesktop.loadTaskDetail({
        ...queryMeta(),
        type: "task_detail",
        taskId: nextTaskId,
      }));
      if (detail !== undefined && sessionId === selectedSessionId.value) {
        selectedTask.value = detail;
        if (!detail.artifacts.some((artifact) =>
          artifact.artifactId === artifactPreview.value?.artifactId)) {
          artifactPreview.value = undefined;
        }
        if (!detail.artifacts.some((artifact) =>
          artifact.artifactId === artifactHtmlPreview.value?.artifactId)) {
          await closeCurrentHtmlPreview();
        }
      }
    }

    async function loadArtifactCatalog(): Promise<void> {
      const catalog = await accept(window.robothreeDesktop.listArtifacts({
        ...queryMeta(),
        type: "list_artifacts",
        sourceKinds: ["workspace_file"],
        includeDeleted: showDeletedArtifacts.value,
        limit: 200,
      }));
      if (catalog !== undefined) artifactCatalog.value = catalog;
    }

    async function refreshArtifactSurfaces(): Promise<void> {
      await Promise.all([
        refreshSelectedTaskDetail(),
        loadArtifactCatalog(),
      ]);
    }

    async function openTask(taskId: string): Promise<void> {
      await guarded(async () => {
        const detail = await accept(window.robothreeDesktop.loadTaskDetail({
          ...queryMeta(),
          type: "task_detail",
          taskId,
        }));
        if (detail !== undefined) {
          selectedTask.value = detail;
          artifactPreview.value = undefined;
          await closeCurrentHtmlPreview();
        }
      }, false);
    }

    async function loadArtifactPreview(
      artifact: ArtifactPanelItem,
      mode: ArtifactPreviewMode,
    ): Promise<void> {
      if (artifact.previewState !== "available" || artifactLifecycle(artifact).deleted) return;
      artifactPreview.value = {
        artifactId: artifact.artifactId,
        mode,
        status: "loading",
      };
      const result = await window.robothreeDesktop.previewArtifact({
        ...queryMeta(),
        type: "artifact_preview",
        artifactId: artifact.artifactId,
        mode,
        maxBytes: 16 * 1024,
      });
      if (!result.ok) {
        artifactPreview.value = {
          artifactId: artifact.artifactId,
          mode,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactPreview.value = {
        artifactId: artifact.artifactId,
        mode,
        status: "ready",
        result: result.value,
      };
    }

    async function startArtifactHtmlPreview(
      artifact: ArtifactPanelItem,
    ): Promise<void> {
      if (artifact.previewState !== "available" || artifactLifecycle(artifact).deleted) return;
      await closeCurrentHtmlPreview();
      artifactHtmlPreview.value = {
        artifactId: artifact.artifactId,
        status: "loading",
      };
      const result = await window.robothreeDesktop.startArtifactHtmlPreview({
        ...queryMeta(),
        type: "artifact_html_preview",
        artifactId: artifact.artifactId,
        maxBytes: 16 * 1024,
        ttlMs: 5 * 60 * 1_000,
      });
      if (!result.ok) {
        artifactHtmlPreview.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactHtmlPreview.value = {
        artifactId: artifact.artifactId,
        status: "ready",
        result: result.value,
      };
    }

    async function refreshSelectedTaskDetail(): Promise<void> {
      const taskId = selectedTask.value?.summary.taskId;
      if (taskId === undefined) return;
      const detail = await accept(window.robothreeDesktop.loadTaskDetail({
        ...queryMeta(),
        type: "task_detail",
        taskId,
      }));
      if (detail !== undefined) selectedTask.value = detail;
    }

    async function setArtifactLifecycle(
      artifact: ArtifactPanelItem,
      change: { pinned?: boolean; dismissed?: boolean },
    ): Promise<void> {
      if (artifactLifecycle(artifact).deleted) return;
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.setArtifactLifecycle({
        ...commandMeta(),
        type: "set_artifact_lifecycle",
        artifactId: artifact.artifactId,
        ...change,
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactAction.value = undefined;
      notice.value = result.value.lifecycle.dismissed
        ? "Artifact dismissed."
        : result.value.lifecycle.pinned
          ? "Artifact pinned."
          : "Artifact updated.";
      await refreshArtifactSurfaces();
    }

    async function deleteArtifactRecord(artifact: ArtifactPanelItem): Promise<void> {
      const lifecycle = artifactLifecycle(artifact);
      if (lifecycle.deleted) return;
      if (!window.confirm(`Remove artifact "${artifact.displayName}" from this task? The source file will not be deleted.`)) {
        return;
      }
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.deleteArtifactRecord({
        ...commandMeta(),
        type: "delete_artifact_record",
        artifactId: artifact.artifactId,
        expectedArtifactRevision: lifecycle.revision,
        reasonSummary: "Removed from artifact panel.",
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      if (artifactPreview.value?.artifactId === artifact.artifactId) {
        artifactPreview.value = undefined;
      }
      if (artifactHtmlPreview.value?.artifactId === artifact.artifactId) {
        await closeCurrentHtmlPreview();
      }
      artifactAction.value = undefined;
      notice.value = "Artifact removed from this task. Source file was not deleted.";
      await refreshArtifactSurfaces();
    }

    async function restoreArtifactRecord(artifact: ArtifactPanelItem): Promise<void> {
      const lifecycle = artifactLifecycle(artifact);
      if (!lifecycle.deleted || lifecycle.sourceDeleted) return;
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.restoreArtifactRecord({
        ...commandMeta(),
        type: "restore_artifact_record",
        artifactId: artifact.artifactId,
        expectedArtifactRevision: lifecycle.revision,
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactAction.value = undefined;
      notice.value = "Artifact restored to this task.";
      await refreshArtifactSurfaces();
    }

    async function deleteArtifactSourceFile(artifact: ArtifactPanelItem): Promise<void> {
      const lifecycle = artifactLifecycle(artifact);
      if (lifecycle.deleted || lifecycle.sourceDeleted || artifact.relativePath === undefined) return;
      const expectedConfirmation = `DELETE ${artifact.displayName}`;
      const confirmation = window.prompt(
        `Move "${artifact.displayName}" to Trash? Type ${expectedConfirmation} to confirm.`,
      )?.trim();
      if (confirmation === undefined) return;
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.deleteArtifactSourceFile({
        ...commandMeta(),
        type: "delete_artifact_source_file",
        artifactId: artifact.artifactId,
        expectedArtifactRevision: lifecycle.revision,
        confirmationText: confirmation,
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      if (artifactPreview.value?.artifactId === artifact.artifactId) {
        artifactPreview.value = undefined;
      }
      if (artifactHtmlPreview.value?.artifactId === artifact.artifactId) {
        await closeCurrentHtmlPreview();
      }
      artifactAction.value = undefined;
      notice.value = "Artifact source file moved to Trash.";
      await refreshArtifactSurfaces();
    }

    async function openArtifactLocation(artifact: ArtifactPanelItem): Promise<void> {
      if (artifactLifecycle(artifact).deleted) return;
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.openArtifactLocation({
        ...commandMeta(),
        type: "open_artifact_location",
        artifactId: artifact.artifactId,
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactAction.value = undefined;
      notice.value = "Artifact location opened.";
    }

    async function exportArtifact(artifact: ArtifactPanelItem): Promise<void> {
      if (artifactLifecycle(artifact).deleted) return;
      artifactAction.value = {
        artifactId: artifact.artifactId,
        status: "running",
      };
      const result = await window.robothreeDesktop.exportArtifact({
        ...commandMeta(),
        type: "export_artifact",
        artifactId: artifact.artifactId,
      });
      if (!result.ok) {
        artifactAction.value = {
          artifactId: artifact.artifactId,
          status: "error",
          error: explainDesktopError(result.error),
        };
        return;
      }
      artifactAction.value = undefined;
      notice.value = result.value.exported
        ? `Artifact exported: ${result.value.fileName ?? "file"}`
        : "Artifact export cancelled.";
    }

    async function controlTask(
      command: TaskControlIntent,
    ): Promise<void> {
      await guarded(async () => {
        const receipt = await accept(window.robothreeDesktop.controlTask({
          ...commandMeta(),
          ...command,
        } as TaskControlCommand));
        if (receipt === undefined) return;
        notice.value = receipt.status === "replayed"
          ? "操作已处理，正在刷新持久状态。"
          : "操作已提交给 Local Core。";
        await loadSnapshot();
      });
    }

    async function cancelSelectedTask(): Promise<void> {
      const task = selectedTask.value?.summary;
      if (
        task === undefined
        || !window.confirm("确定停止这个任务吗？")
      ) return;
      await controlTask({
        type: "cancel_task",
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
        reasonSummary: "Cancelled by the Desktop user.",
      });
    }

    async function retrySelectedTask(): Promise<void> {
      const task = selectedTask.value?.summary;
      if (task === undefined) return;
      await controlTask({
        type: "retry_task",
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
      });
    }

    async function continueSelectedTask(): Promise<void> {
      const task = selectedTask.value?.summary;
      if (task === undefined) return;
      await controlTask({
        type: "continue_task",
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
      });
    }

    async function provideSelectedTaskInput(): Promise<void> {
      const task = selectedTask.value?.summary;
      if (task === undefined) return;
      const input = window.prompt("补充任务所需信息")?.trim();
      if (!input) return;
      await controlTask({
        type: "provide_task_input",
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
        input,
      });
    }

    async function decideConfirmation(
      confirmation: UserConfirmationProjection,
      decision: "confirmed" | "rejected",
    ): Promise<void> {
      const task = selectedTask.value?.summary;
      if (
        task === undefined
        || !canShowConfirmationDecisionActions(confirmation)
        || (
          decision === "confirmed"
          && !window.confirm(
            `${confirmation.consequenceSummary}\n\n确认后只允许执行卡片中描述的这一项操作。是否继续？`,
          )
        )
      ) return;
      await controlTask({
        type: "decide_user_confirmation",
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
        confirmationId: confirmation.confirmationId,
        requestDigest: confirmation.requestDigest,
        decision,
      });
    }

    async function submitTurn(): Promise<void> {
      const text = composer.value.trim();
      const agent = selectedAgent.value;
      if (!text || agent === undefined || !selectedSessionId.value) return;
      await guarded(async () => {
        const receipt = await accept(window.robothreeDesktop.submitTurn({
          ...commandMeta(),
          type: "submit_turn",
          clientTurnId: `turn:${crypto.randomUUID()}`,
          sessionId: selectedSessionId.value,
          userInput: text,
          selectionRequest: {
            agentId: agent.agentId,
            ...(requestedModelId.value
              ? { requestedModelId: requestedModelId.value }
              : {}),
            selectedSkillIds: agent.skills.filter((item) => item.available)
              .map((item) => item.id),
            selectedKnowledgeIds: agent.knowledge.filter((item) => item.available)
              .map((item) => item.id),
            ...(selectedWorkspaceId.value
              ? { workspaceGrantId: selectedWorkspaceId.value }
              : {}),
          },
        }));
        if (receipt === undefined) return;
        composer.value = "";
        notice.value = receipt.status === "replayed"
          ? "该请求已恢复，正在读取持久记录。"
          : "任务已接受并进入本地 Agent Runtime。";
        await loadSnapshot();
      });
    }

    async function guarded(
      operation: () => Promise<void>,
      ownBusy = true,
    ): Promise<void> {
      if (ownBusy && busy.value) return;
      if (ownBusy) busy.value = true;
      notice.value = "";
      try {
        await operation();
      } catch {
        error.value = "操作未完成，请检查本地运行时状态后重试。";
      } finally {
        if (ownBusy) busy.value = false;
      }
    }

    function handleDesktopEvent(event: DesktopRendererEvent): void {
      if (!("deliveryKind" in event)) {
        streamingAssistant.value = undefined;
        void loadSnapshot();
        return;
      }
      if (
        event.deliveryKind === "ephemeral"
        && event.payload.type === "assistant_token_delta"
        && event.payload.sessionId === selectedSessionId.value
      ) {
        const current = streamingAssistant.value;
        if (
          current === undefined
          || current.messageId !== event.payload.messageId
          || current.runtimeInstanceId !== event.runtimeInstanceId
        ) {
          if (event.payload.deltaSequence !== 0) return;
          streamingAssistant.value = {
            sessionId: event.payload.sessionId,
            messageId: event.payload.messageId,
            runtimeInstanceId: event.runtimeInstanceId,
            lastDeltaSequence: 0,
            text: event.payload.delta,
          };
          return;
        }
        if (event.payload.deltaSequence !== current.lastDeltaSequence + 1) return;
        streamingAssistant.value = {
          ...current,
          lastDeltaSequence: event.payload.deltaSequence,
          text: current.text + event.payload.delta,
        };
        return;
      }
      if (
        event.deliveryKind === "durable"
        && "sessionId" in event.payload
        && event.payload.sessionId === selectedSessionId.value
      ) {
        if (
          event.payload.type === "message_committed"
          && streamingAssistant.value?.messageId === event.payload.messageId
        ) {
          streamingAssistant.value = undefined;
        }
        void loadSnapshot();
        return;
      }
      if (
        event.deliveryKind === "durable"
        && (
          event.payload.type === "tool_activity_changed"
          || event.payload.type === "user_confirmation_changed"
        )
      ) {
        const taskId = event.payload.taskId;
        if (taskSummaries.value.some((task) => task.taskId === taskId)) {
          void loadTasks(selectedSessionId.value, taskId);
        }
      }
    }

    onMounted(async () => {
      unsubscribe = window.robothreeDesktop.onDesktopEvent(handleDesktopEvent);
      await refreshCatalogAndShell();
    });
    onUnmounted(() => {
      unsubscribe?.();
      void closeCurrentHtmlPreview();
    });

    function renderArtifactPanel(
      title: string,
      indexedArtifacts: readonly ArtifactPanelItem[],
    ) {
      if (indexedArtifacts.length === 0) return null;
      const deletedCount = indexedArtifacts.filter((artifact) =>
        artifactLifecycle(artifact).deleted).length;
      const visibleArtifacts = showDeletedArtifacts.value
        ? indexedArtifacts
        : indexedArtifacts.filter((artifact) => !artifactLifecycle(artifact).deleted);
      return h("section", {
        class: "artifact-panel",
        "aria-label": "Artifact metadata",
      }, [
        h("header", [
          h("strong", title),
          h("div", { class: "artifact-panel-tools" }, [
            h("small",
              deletedCount === 0
                ? `${indexedArtifacts.length} indexed`
                : `${visibleArtifacts.length} shown · ${indexedArtifacts.length} indexed`),
            h("button", {
              class: "secondary",
              type: "button",
              disabled: busy.value,
              onClick: () => void registerWorkspaceArtifact(),
            }, "Register File"),
            deletedCount === 0
              ? null
              : h("button", {
                class: "secondary",
                type: "button",
                onClick: () => {
                  showDeletedArtifacts.value = !showDeletedArtifacts.value;
                  void loadArtifactCatalog();
                },
              }, showDeletedArtifacts.value ? "Hide Removed" : "Show Removed"),
          ]),
        ]),
        h("div", { class: "artifact-grid" },
          visibleArtifacts.map((artifact) => renderArtifactCard(artifact))),
        renderArtifactPreview(),
        renderArtifactHtmlPreview(),
      ]);
    }

    function renderArtifactCard(artifact: ArtifactPanelItem) {
      const artifactPresentation = presentArtifact(artifact);
      const lifecycle = artifactLifecycle(artifact);
      return h("article", {
        class: [
          "artifact-card",
          artifactPresentation.tone,
          lifecycle.pinned ? "pinned" : "",
          lifecycle.dismissed ? "dismissed" : "",
          lifecycle.deleted ? "deleted" : "",
        ],
      }, [
        h("header", [
          h("div", [
            h("strong", artifactPresentation.title),
            h("small", artifactPresentation.summary),
          ]),
          h("span", artifactPresentation.stateLabel),
        ]),
        h("p", artifactPresentation.kindLabel),
        h("dl", artifactPresentation.meta.map((item) =>
          h("div", [
            h("dt", item.label),
            h("dd", item.value),
          ]))),
        lifecycle.deleted
          ? h("footer", { class: "artifact-card-actions" }, [
            lifecycle.sourceDeleted
              ? h("span", { class: "artifact-source-deleted" }, "Source moved to Trash")
              : h("button", {
                class: "secondary",
                type: "button",
                disabled: artifactAction.value?.artifactId === artifact.artifactId,
                onClick: () => void restoreArtifactRecord(artifact),
              }, "Restore"),
          ])
          : artifact.previewState === "available"
            ? h("footer", { class: "artifact-card-actions" }, [
              h("button", {
                class: "secondary",
                type: "button",
                disabled: artifactPreview.value?.status === "loading",
                onClick: () => void loadArtifactPreview(artifact, "text"),
              }, "Text"),
              h("button", {
                class: "secondary",
                type: "button",
                disabled: artifactPreview.value?.status === "loading",
                onClick: () => void loadArtifactPreview(artifact, "markdown"),
              }, "Markdown"),
              h("button", {
                class: "secondary",
                type: "button",
                disabled: artifactHtmlPreview.value?.status === "loading",
                onClick: () => void startArtifactHtmlPreview(artifact),
              }, "HTML"),
              ...renderArtifactFileActions(artifact, lifecycle),
            ])
            : h("footer", { class: "artifact-card-actions" }, renderArtifactFileActions(
              artifact,
              lifecycle,
            )),
        artifactAction.value?.artifactId === artifact.artifactId
          && artifactAction.value.status === "error"
          ? h("p", { class: "artifact-action-error" },
            artifactAction.value.error ?? "Artifact action failed.")
          : null,
      ]);
    }

    function renderArtifactFileActions(
      artifact: ArtifactPanelItem,
      lifecycle: ArtifactLifecycleProjection,
    ) {
      const fileActions = [
        h("button", {
          class: "secondary",
          type: "button",
          disabled: artifactAction.value?.artifactId === artifact.artifactId,
          onClick: () => void setArtifactLifecycle(artifact, {
            pinned: !lifecycle.pinned,
          }),
        }, lifecycle.pinned ? "Unpin" : "Pin"),
        h("button", {
          class: "secondary",
          type: "button",
          disabled: artifactAction.value?.artifactId === artifact.artifactId,
          onClick: () => void setArtifactLifecycle(artifact, {
            dismissed: !lifecycle.dismissed,
          }),
        }, lifecycle.dismissed ? "Restore" : "Dismiss"),
      ];
      if (artifact.relativePath !== undefined) {
        fileActions.push(
          h("button", {
            class: "secondary",
            type: "button",
            disabled: artifactAction.value?.artifactId === artifact.artifactId,
            onClick: () => void openArtifactLocation(artifact),
          }, "Reveal"),
          h("button", {
            class: "secondary",
            type: "button",
            disabled: artifactAction.value?.artifactId === artifact.artifactId,
            onClick: () => void exportArtifact(artifact),
          }, "Export"),
          h("button", {
            class: "secondary danger",
            type: "button",
            disabled: artifactAction.value?.artifactId === artifact.artifactId,
            onClick: () => void deleteArtifactSourceFile(artifact),
          }, "Trash Source"),
        );
      }
      fileActions.push(h("button", {
        class: "secondary danger",
        type: "button",
        disabled: artifactAction.value?.artifactId === artifact.artifactId,
        onClick: () => void deleteArtifactRecord(artifact),
      }, "Remove"));
      return fileActions;
    }

    function renderArtifactPreview() {
      const current = artifactPreview.value;
      if (current === undefined) return null;
      if (current.status === "loading") {
        return h("section", { class: "artifact-preview-shell" }, [
          h("strong", "Preview"),
          h("p", "Loading preview..."),
        ]);
      }
      if (current.status === "error") {
        return h("section", { class: "artifact-preview-shell error" }, [
          h("strong", "Preview unavailable"),
          h("p", current.error ?? "The artifact preview is unavailable."),
        ]);
      }
      if (current.result === undefined) return null;
      const preview = presentArtifactPreview(current.result);
      return h("section", { class: "artifact-preview-shell" }, [
        h("header", [
          h("strong", current.mode === "markdown" ? "Markdown Preview" : "Text Preview"),
          preview.truncated ? h("small", "Truncated") : null,
        ]),
        current.mode === "text"
          ? h("pre", { class: "artifact-preview-text" }, preview.text)
          : h("div", { class: "artifact-preview-markdown" },
            preview.blocks.map(renderArtifactPreviewBlock)),
        preview.warnings.length === 0
          ? null
          : h("ul", { class: "artifact-preview-warnings" },
            preview.warnings.map((warning) => h("li", warning))),
      ]);
    }

    function renderArtifactHtmlPreview() {
      const current = artifactHtmlPreview.value;
      if (current === undefined) return null;
      if (current.status === "loading") {
        return h("section", { class: "artifact-html-preview-shell" }, [
          h("header", [
            h("strong", "HTML Preview"),
            h("button", {
              class: "secondary",
              type: "button",
              onClick: () => void closeCurrentHtmlPreview(),
            }, "Close"),
          ]),
          h("p", "Starting local preview..."),
        ]);
      }
      if (current.status === "error") {
        return h("section", { class: "artifact-html-preview-shell error" }, [
          h("header", [
            h("strong", "HTML Preview unavailable"),
            h("button", {
              class: "secondary",
              type: "button",
              onClick: () => void closeCurrentHtmlPreview(),
            }, "Close"),
          ]),
          h("p", current.error ?? "The HTML preview is unavailable."),
        ]);
      }
      if (current.result === undefined) return null;
      return h("section", { class: "artifact-html-preview-shell" }, [
        h("header", [
          h("strong", "HTML Preview"),
          h("button", {
            class: "secondary",
            type: "button",
            onClick: () => void closeCurrentHtmlPreview(),
          }, "Close"),
        ]),
        h("iframe", {
          class: "artifact-html-preview-frame",
          sandbox: "",
          referrerpolicy: "no-referrer",
          src: current.result.previewUrl,
          title: "Artifact HTML preview",
        }),
      ]);
    }

    function renderArtifactPreviewBlock(block: ArtifactPreviewBlock) {
      switch (block.kind) {
        case "heading":
          return h(block.level === 2 ? "h3" : "h4", block.text);
        case "paragraph":
          return h("p", block.text);
        case "list_item":
          return h("p", { class: "artifact-preview-list-item" }, block.text);
        case "code":
          return h("pre", { class: "artifact-preview-code" }, block.text);
        case "table_row":
          return h("div", { class: "artifact-preview-table-row" },
            block.cells.map((cell) => h("span", cell)));
      }
    }

    return () => h("main", { class: "workbench-shell" }, [
      h("aside", { class: "session-sidebar" }, [
        h("header", { class: "brand" }, [
          h("span", { class: "brand-mark", "aria-hidden": "true" }, "R3"),
          h("div", [
            h("strong", "RoboThree"),
            h("small", "Local Agent Workspace"),
          ]),
        ]),
        h("button", {
          class: "primary new-session",
          type: "button",
          disabled: busy.value,
          onClick: () => void createSession(),
        }, [h("span", { "aria-hidden": "true" }, "＋"), " 新建会话"]),
        h("nav", { class: "session-list", "aria-label": "会话列表" },
          sessions.value.length === 0
            ? [h("p", { class: "empty-copy" }, "还没有会话。创建一个会话开始任务。")]
            : sessions.value.map((session) => h("button", {
              class: [
                "session-item",
                session.sessionId === selectedSessionId.value ? "active" : "",
              ],
              type: "button",
              onClick: () => void openSession(session.sessionId),
            }, [
              h("span", { class: "session-glyph", "aria-hidden": "true" }, "◇"),
              h("span", { class: "session-copy" }, [
                h("strong", session.title),
                h("small", formatDisplayTime(session.updatedAt)),
              ]),
            ])),
        ),
        h("footer", { class: "sidebar-footer" }, [
          h("span", {
            class: [
              "status-dot",
              shellRuntimePresentation.value.isReady ? "ready" : "",
            ],
          }),
          h("span", shellRuntimePresentation.value.sidebarStatusLabel),
        ]),
      ]),
      h("section", { class: "workspace-pane" }, [
        h("header", { class: "workspace-header" }, [
          h("div", { class: "workspace-picker" }, [
            h("label", { for: "workspace" }, "工作目录"),
            h("select", {
              id: "workspace",
              value: selectedWorkspaceId.value,
              onChange: (event: Event) => {
                selectedWorkspaceId.value = (event.target as HTMLSelectElement).value;
              },
            }, [
              h("option", { value: "" }, "不使用工作目录"),
              ...workspaces.value.map((workspace) => h("option", {
                value: workspace.workspaceGrantId,
              }, workspaceOptionLabel(workspace))),
            ]),
            h("button", {
              class: "secondary",
              type: "button",
              disabled: busy.value,
              onClick: () => void chooseWorkspace(),
            }, "授权目录"),
            h("button", {
              class: "secondary",
              type: "button",
              disabled: busy.value || workspaces.value.length === 0,
              onClick: () => void registerWorkspaceArtifact(),
            }, "注册文件"),
            selectedWorkspaceId.value
              ? h("button", {
                class: "icon-button danger",
                type: "button",
                title: "撤销当前目录授权",
                onClick: () => void revokeWorkspace(selectedWorkspaceId.value),
              }, "×")
              : null,
          ]),
          h("div", { class: "runtime-pills" }, [
            pill("Core", shellRuntimePresentation.value.corePillLabel),
            pill("Contract", "v1alpha1"),
            pill(
              "企业配置",
              shellRuntimePresentation.value.enterpriseConfigPillLabel,
            ),
          ]),
        ]),
        selectedTask.value === undefined
          ? renderArtifactPanel("Registered Files", artifactCatalog.value?.artifacts ?? [])
          : null,
        h("section", { class: "conversation-pane" }, [
          selectedSession.value === undefined
            ? h("div", { class: "welcome-state" }, [
              h("span", { class: "welcome-orbit", "aria-hidden": "true" }, "R3"),
              h("p", { class: "eyebrow" }, "ROBOTHREE DESKTOP"),
              h("h1", "把复杂任务交给一个可靠的本地 Agent"),
              h("p", "选择工作目录并创建会话。RoboThree 会锁定 Agent、Model 与授权边界，然后在 Local Core 中持久执行。"),
              h("button", {
                class: "primary",
                type: "button",
                onClick: () => void createSession(),
              }, "创建第一个会话"),
            ])
            : [
              h("header", { class: "conversation-header" }, [
                h("div", [
                  h("span", { class: "eyebrow" }, "ACTIVE SESSION"),
                  h("h2", selectedSession.value.title),
                ]),
                h("div", { class: "header-actions" }, [
                  h("button", {
                    class: "icon-button",
                    type: "button",
                    title: "重命名会话",
                    onClick: () => void renameCurrentSession(),
                  }, "✎"),
                  h("button", {
                    class: "icon-button danger",
                    type: "button",
                    title: "删除会话",
                    onClick: () => void deleteCurrentSession(),
                  }, "⌫"),
                ]),
              ]),
              taskSummaries.value.length === 0
                ? null
                : h("section", {
                  class: "task-board",
                  "aria-label": "任务运行状态",
                }, [
                  h("div", { class: "task-tabs" }, taskSummaries.value.map((task) => {
                    const taskPresentation = presentTaskStatus(task.displayStatus);
                    return h("button", {
                      class: [
                        "task-tab",
                        selectedTask.value?.summary.taskId === task.taskId
                          ? "active"
                          : "",
                      ],
                      type: "button",
                      onClick: () => void openTask(task.taskId),
                    }, [
                      h("span", { class: ["task-status-dot", taskPresentation.statusClass] }),
                      h("span", `任务 ${shortDisplayId(task.taskId)}`),
                      h("small", taskPresentation.label),
                    ]);
                  })),
                  selectedTask.value === undefined
                    ? null
                    : (() => {
                      const task = selectedTask.value;
                      const taskPresentation = presentTaskStatus(task.summary.displayStatus);
                      return h("div", { class: "task-detail" }, [
                        h("div", { class: "task-detail-summary" }, [
                          h("strong", taskPresentation.label),
                          h("span", `Agent · ${task.summary.resolvedAgentId}`),
                          h("span", `Model · ${task.summary.resolvedModelId}`),
                          task.summary.failureSummary === undefined
                            ? null
                            : h("em", task.summary.failureSummary),
                          taskPresentation.guidance === undefined
                            ? null
                            : h("p", { class: "task-guidance" }, taskPresentation.guidance),
                        ]),
                        h("div", { class: "task-controls" }, [
                          taskPresentation.controls.canCancel
                            ? h("button", {
                              class: "secondary danger",
                              type: "button",
                              disabled: busy.value,
                              onClick: () => void cancelSelectedTask(),
                            }, "停止任务")
                            : null,
                          taskPresentation.controls.canRetry
                            ? h("button", {
                              class: "secondary",
                              type: "button",
                              disabled: busy.value,
                              onClick: () => void retrySelectedTask(),
                            }, "重试")
                            : null,
                          taskPresentation.controls.canContinue
                            ? h("button", {
                              class: "secondary",
                              type: "button",
                              disabled: busy.value,
                              onClick: () => void continueSelectedTask(),
                            }, "继续")
                            : null,
                          taskPresentation.controls.canProvideInput
                            ? h("button", {
                              class: "primary",
                              type: "button",
                              disabled: busy.value,
                              onClick: () => void provideSelectedTaskInput(),
                            }, "补充输入")
                            : null,
                        ]),
                        task.userConfirmations.length === 0
                          ? null
                          : h("div", {
                            class: "confirmation-list",
                            "aria-label": "用户确认",
                          }, task.userConfirmations.map((confirmation) => {
                            const confirmationPresentation =
                              presentUserConfirmation(confirmation);
                            return h("article", {
                              class: [
                                "confirmation-card",
                                confirmationPresentation.statusClass,
                              ],
                            }, [
                              h("header", [
                                h("strong", confirmationPresentation.title),
                                h("small", confirmationPresentation.riskSummary),
                              ]),
                              h("p", confirmationPresentation.reasonSummary),
                              h("dl", confirmationPresentation.meta.map((item) =>
                                h("div", [
                                  h("dt", item.label),
                                  h("dd", item.value),
                                ]))),
                              confirmationPresentation.canShowDecisionActions
                                ? h("footer", [
                                  h("button", {
                                    class: "secondary danger",
                                    type: "button",
                                    disabled: busy.value,
                                    onClick: () => void decideConfirmation(
                                      confirmation,
                                      "rejected",
                                    ),
                                  }, "拒绝"),
                                  h("button", {
                                    class: "primary",
                                    type: "button",
                                    disabled: busy.value,
                                    onClick: () => void decideConfirmation(
                                      confirmation,
                                      "confirmed",
                                    ),
                                  }, "允许这一次"),
                                ])
                                : null,
                            ]);
                          })),
                      task.runs.flatMap((run) => run.steps).length === 0
                        ? null
                        : h("ol", { class: "step-list" },
                          task.runs.flatMap((run) => run.steps)
                            .map((step) => {
                              const stepPresentation =
                                presentTaskStatus(step.displayStatus);
                              return h("li", [
                                h("span", `Step ${step.sequence}`),
                                h("strong", step.actionSummary),
                                h("small", stepPresentation.label),
                              ]);
                            })),
                      renderArtifactPanel("Artifacts", [
                        ...task.artifacts,
                        ...(artifactCatalog.value?.artifacts ?? []),
                      ]),
                      task.toolActivities.length === 0
                        ? null
                        : h("div", { class: "tool-activity-panel" }, [
                          h("strong", "Tool Activity"),
                          ...task.toolActivities.map((activity) => {
                            const presentation = presentToolActivity(activity);
                            return h("article", { class: ["tool-activity-card", presentation.tone] }, [
                              h("header", { class: "tool-activity-header" }, [
                                h("div", [
                                  h("strong", activity.toolName),
                                  h("small", activity.operationType),
                                ]),
                                h("p", { class: "tool-activity-status" }, [
                                  h("span", {
                                    class: "tool-activity-status-icon",
                                    "aria-hidden": "true",
                                  }, presentation.statusIcon),
                                  h("em", presentation.statusLabel),
                                ]),
                              ]),
                              h("p", { class: "tool-activity-summary" }, presentation.summary),
                              h("dl", { class: "tool-activity-meta" }, [
                                ...presentation.meta.map((item) =>
                                  h("div", [
                                    h("dt", item.label),
                                    h("dd", item.value),
                                  ])),
                                h("div", [
                                  h("dt", "更新时间"),
                                  h("dd", formatDisplayTime(activity.updatedAt)),
                                ]),
                              ]),
                            ]);
                          }),
                          showToolPanel.value
                            ? h("section", {
                              id: "tool-activity-inline-help",
                              class: "tool-activity-inline-help",
                              "aria-label": "工具状态说明",
                            }, [
                              h("p", "工具状态说明：完成代表执行结束；失败/超时/需要人工处理需要核查上下文后重试。"),
                              h("p", "建议关注安全边界与目标摘要；若出现路径越权，请先调整授权目录或清理危险路径。"),
                            ])
                            : null,
                        ]),
                      ]);
                    })(),
                ]),
              h("div", { class: "message-list", "aria-live": "polite" },
                (snapshot.value?.messages.length || streamingAssistant.value)
                  ? [
                      ...(snapshot.value?.messages ?? []).map((message) => {
                    const messagePresentation = presentDurableMessage(message);
                    return h("article", {
                      class: ["message", messagePresentation.roleClass],
                    }, [
                      h("span", { class: "message-avatar" }, messagePresentation.avatar),
                      h("div", { class: "message-body" }, [
                        h("header", [
                          h("strong", messagePresentation.authorName),
                          h("small", messagePresentation.statusLabel),
                        ]),
                        h("p", messagePresentation.content),
                      ]),
                    ]);
                  }),
                      ...(streamingAssistant.value === undefined
                        ? []
                        : [(() => {
                          const streamingPresentation =
                            presentStreamingAssistant(streamingAssistant.value);
                          return h("article", {
                            class: ["message", "message-assistant", "message-streaming"],
                          }, [
                            h("span", { class: "message-avatar" },
                              streamingPresentation.avatar),
                            h("div", { class: "message-body" }, [
                              h("header", [
                                h("strong", streamingPresentation.authorName),
                                h("small", streamingPresentation.statusLabel),
                              ]),
                              h("p", streamingPresentation.content),
                            ]),
                          ]);
                        })()]),
                    ]
                  : [h("div", { class: "empty-conversation" }, [
                    h("strong", "准备好开始了"),
                    h("p", "输入任务后，实际运行组合会由 Local Core 校验并锁定。"),
                  ])],
              ),
              error.value
                ? h("div", { class: "notice error", role: "alert" }, error.value)
                : notice.value
                  ? h("div", { class: "notice success", role: "status" }, notice.value)
                  : null,
              h("form", {
                class: "composer",
                onSubmit: (event: Event) => {
                  event.preventDefault();
                  void submitTurn();
                },
              }, [
                h("div", { class: "runtime-selection" }, [
                  h("label", [
                    h("span", "Agent"),
                    h("select", {
                      value: selectedAgentId.value,
                      onChange: (event: Event) => {
                        selectedAgentId.value = (event.target as HTMLSelectElement).value;
                        requestedModelId.value = "";
                      },
                    }, agents.value.map((agent) => h("option", {
                      value: agent.agentId,
                      disabled: !agent.runnable,
                    }, agent.name))),
                  ]),
                  h("label", [
                    h("span", "Model"),
                    h("select", {
                      value: requestedModelId.value,
                      disabled: composerPresentation.value.modelOverrideDisabled,
                      onChange: (event: Event) => {
                        requestedModelId.value = (event.target as HTMLSelectElement).value;
                      },
                    }, [
                      h("option", { value: "" },
                        composerPresentation.value.defaultModelOptionLabel),
                      ...composerPresentation.value.overrideModelOptions
                        .map((model) => h("option", {
                          value: model.modelId,
                        }, model.name)),
                    ]),
                  ]),
                  h("span", { class: "selection-summary" },
                    composerPresentation.value.selectionSummary),
                ]),
                h("div", {
                  class: [
                    "document-tool-status",
                    composerPresentation.value.documentWorkspaceRequired
                      ? "needs-workspace"
                      : "",
                  ],
                }, [
                  h("span", { "aria-hidden": "true" }, "▤"),
                  h("strong", composerPresentation.value.documentToolSummary),
                ]),
                h("textarea", {
                  value: composer.value,
                  rows: 3,
                  maxlength: 131_072,
                  placeholder: "描述你想完成的任务…",
                  disabled: busy.value,
                  onInput: (event: Event) => {
                    composer.value = (event.target as HTMLTextAreaElement).value;
                  },
                  onKeydown: (event: KeyboardEvent) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitTurn();
                    }
                  },
                }),
                h("div", { class: "composer-footer" }, [
                  h("span", "Enter 发送 · Shift + Enter 换行"),
                  h("button", {
                    class: "icon-button",
                    type: "button",
                    "aria-label": showToolPanel.value
                      ? "收起工具活动状态说明"
                      : "展开工具活动状态说明",
                    "aria-expanded": String(showToolPanel.value),
                    "aria-controls": "tool-activity-inline-help",
                    onClick: () => {
                      showToolPanel.value = !showToolPanel.value;
                    },
                  }, [
                    h("span", { class: "visually-hidden" }, showToolPanel.value
                      ? "收起工具活动状态说明"
                      : "展开工具活动状态说明"),
                    h("span", { "aria-hidden": "true" }, showToolPanel.value ? "◉" : "◌"),
                  ]),
                  h("button", {
                    class: "send-button",
                    type: "submit",
                    disabled: composerPresentation.value.sendDisabled,
                  }, composerPresentation.value.sendButtonLabel),
                ]),
              ]),
            ],
        ]),
      ]),
      loading.value
        ? h("div", { class: "loading-cover", "aria-label": "正在加载" }, [
          h("span", { class: "loader" }),
        ])
        : null,
    ]);
  },
});

function pill(label: string, value: string) {
  return h("span", { class: "runtime-pill" }, [
    h("small", label),
    h("strong", value),
  ]);
}

export default App;
