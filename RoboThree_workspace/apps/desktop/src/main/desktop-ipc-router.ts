import {
  ArtifactExportCommandSchema,
  ArtifactExportReceiptSchema,
  ArtifactOpenLocationCommandSchema,
  ArtifactOpenLocationReceiptSchema,
  CreateSessionCommandSchema,
  DeleteSessionCommandSchema,
  ArtifactPreviewQuerySchema,
  ArtifactHtmlPreviewQuerySchema,
  ArtifactTextPreviewProjectionSchema,
  CloseArtifactPreviewCommandSchema,
  DeleteArtifactSourceFileCommandSchema,
  DeleteArtifactRecordCommandSchema,
  DesktopDisplayTextSchema,
  DesktopErrorEnvelopeSchema,
  EntityIdSchema,
  ListArtifactsQuerySchema,
  ListAgentsQuerySchema,
  ListModelsQuerySchema,
  ListPendingUserConfirmationsQuerySchema,
  ListTasksQuerySchema,
  ListSessionsQuerySchema,
  ListWorkspaceGrantsQuerySchema,
  OpenSessionQuerySchema,
  RegisterWorkspaceArtifactCommandSchema,
  RegisterWorkspaceArtifactReceiptSchema,
  RenameSessionCommandSchema,
  RestoreArtifactRecordCommandSchema,
  RevokeWorkspaceGrantCommandSchema,
  RuntimeStatusQuerySchema,
  SetArtifactLifecycleCommandSchema,
  SubmitTurnCommandSchema,
  SubmitTurnStatusQuerySchema,
  TaskDetailQuerySchema,
  TaskControlCommandSchema,
  WorkspaceAccessModeSchema,
  ConversationSnapshotQuerySchema,
  type DesktopErrorEnvelope,
} from "@robothree/contracts";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, link, lstat, open, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, join, normalize, relative, resolve, sep } from "node:path";

import {
  DESKTOP_IPC_CHANNELS,
  type CreateWorkspaceGrantFromPickerRequest,
  type DesktopInvokeChannel,
  type FoundationStatus,
  type RendererSafeResult,
  WorkbenchAttachmentPickerCommandSchema,
  WorkbenchAttachmentValidationCommandSchema,
} from "../shared/foundation-api.js";
import type { CorePrivateClient } from "./core-private-client.js";
import {
  htmlPreviewDocumentFromText,
  HtmlPreviewSandbox,
} from "./html-preview-sandbox.js";
import {
  renderPptxHtmlPreviewFromFile,
  type StableFileIdentity,
} from "./pptx-html-preview.js";

export type DesktopCoreAccess = Readonly<{
  client: Pick<
    CorePrivateClient,
    | "runtimeStatus"
    | "registerWorkspaceSelection"
    | "discardWorkspaceSelection"
    | "createWorkspaceGrant"
    | "revokeWorkspaceGrant"
    | "listWorkspaceGrants"
    | "createSession"
    | "renameSession"
    | "deleteSession"
    | "listSessions"
    | "openSession"
    | "listAgents"
    | "listModels"
    | "loadConversationSnapshot"
    | "listTasks"
    | "loadTaskDetail"
    | "listArtifacts"
    | "listWorkspaceGrantAuthorities"
    | "registerWorkspaceArtifact"
    | "previewArtifact"
    | "setArtifactLifecycle"
    | "deleteArtifactRecord"
    | "restoreArtifactRecord"
    | "prepareArtifactSourceFileDeletion"
    | "commitArtifactSourceFileDeletion"
    | "resolveArtifactFileSource"
    | "listPendingUserConfirmations"
    | "controlTask"
    | "submitTurn"
    | "querySubmitTurn"
  >;
  htmlPreviewSandbox?: HtmlPreviewSandbox;
  snapshot?(): Pick<FoundationStatus, "runtimeState">;
}>;

export type ChooseWorkspaceDirectory = () => Promise<string | undefined>;
export type OpenFileLocation = (realPath: string) => void | Promise<void>;
export type ChooseArtifactExportPath = (defaultFileName: string) => Promise<string | undefined>;
export type ChooseWorkspaceArtifactFile = (
  authorities: readonly { rootRealPath: string; rootDisplayPath: string; displayName: string }[],
  options?: Readonly<{ documentSourcesOnly: boolean }>,
) => Promise<string | undefined>;
export type TrashArtifactSourceFile = (realPath: string) => Promise<void>;

export class DesktopIpcRouter {
  readonly #core: DesktopCoreAccess;
  readonly #chooseWorkspaceDirectory: ChooseWorkspaceDirectory;
  readonly #openFileLocation: OpenFileLocation;
  readonly #chooseArtifactExportPath: ChooseArtifactExportPath;
  readonly #chooseWorkspaceArtifactFile: ChooseWorkspaceArtifactFile;
  readonly #trashArtifactSourceFile: TrashArtifactSourceFile;
  readonly #htmlPreviewSandbox: HtmlPreviewSandbox;
  readonly #ensureDefaultWorkspaceGrant: ((input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>) => Promise<string>) | undefined;

  constructor(input: {
    core: DesktopCoreAccess;
    chooseWorkspaceDirectory: ChooseWorkspaceDirectory;
    openFileLocation?: OpenFileLocation;
    chooseArtifactExportPath?: ChooseArtifactExportPath;
    chooseWorkspaceArtifactFile?: ChooseWorkspaceArtifactFile;
    trashArtifactSourceFile?: TrashArtifactSourceFile;
    ensureDefaultWorkspaceGrant?: (input: Readonly<{
      clientInstanceId: string;
      correlationId: string;
    }>) => Promise<string>;
  }) {
    this.#core = input.core;
    this.#chooseWorkspaceDirectory = input.chooseWorkspaceDirectory;
    this.#openFileLocation = input.openFileLocation ?? (() => {
      throw new Error("Artifact open location is unavailable");
    });
    this.#chooseArtifactExportPath = input.chooseArtifactExportPath ?? (async () => undefined);
    this.#chooseWorkspaceArtifactFile = input.chooseWorkspaceArtifactFile ?? (async () => undefined);
    this.#trashArtifactSourceFile = input.trashArtifactSourceFile ?? (async () => {
      throw new Error("Artifact source delete is unsupported");
    });
    this.#htmlPreviewSandbox = input.core.htmlPreviewSandbox ?? new HtmlPreviewSandbox();
    this.#ensureDefaultWorkspaceGrant = input.ensureDefaultWorkspaceGrant;
  }

  async dispatch(
    channel: DesktopInvokeChannel,
    input: unknown,
  ): Promise<RendererSafeResult<unknown>> {
    try {
      switch (channel) {
        case DESKTOP_IPC_CHANNELS.runtimeStatus:
          return await this.#core.client.runtimeStatus(
            RuntimeStatusQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker:
          return await this.#createWorkspaceGrant(parsePickerRequest(input));
        case DESKTOP_IPC_CHANNELS.revokeWorkspaceGrant:
          return await this.#core.client.revokeWorkspaceGrant(
            RevokeWorkspaceGrantCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listWorkspaceGrants:
          return await this.#core.client.listWorkspaceGrants(
            ListWorkspaceGrantsQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.createSession:
          return await this.#core.client.createSession(
            CreateSessionCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.renameSession:
          return await this.#core.client.renameSession(
            RenameSessionCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.deleteSession:
          return await this.#core.client.deleteSession(
            DeleteSessionCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listSessions:
          return await this.#core.client.listSessions(
            ListSessionsQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.openSession:
          return await this.#core.client.openSession(
            OpenSessionQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listAgents:
          return await this.#core.client.listAgents(ListAgentsQuerySchema.parse(input));
        case DESKTOP_IPC_CHANNELS.listModels:
          return await this.#core.client.listModels(ListModelsQuerySchema.parse(input));
        case DESKTOP_IPC_CHANNELS.conversationSnapshot:
          return await this.#core.client.loadConversationSnapshot(
            ConversationSnapshotQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listTasks:
          return await this.#core.client.listTasks(
            ListTasksQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.taskDetail:
          return await this.#core.client.loadTaskDetail(
            TaskDetailQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listArtifacts:
          return await this.#core.client.listArtifacts(
            ListArtifactsQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker:
          return await this.#registerWorkspaceArtifactFromPicker(
            RegisterWorkspaceArtifactCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.pickWorkbenchAttachment: {
          const command = WorkbenchAttachmentPickerCommandSchema.parse(input);
          return await this.#registerWorkspaceArtifactFromPicker(
            projectRegisterWorkspaceArtifactCommand(command),
            {
              workspaceGrantId: command.workspaceGrantId,
              documentSourcesOnly: true,
            },
          );
        }
        case DESKTOP_IPC_CHANNELS.validateWorkbenchAttachment: {
          const command = WorkbenchAttachmentValidationCommandSchema.parse(input);
          return await this.#registerWorkspaceArtifactFromPicker(
            projectRegisterWorkspaceArtifactCommand(command),
            {
              workspaceGrantId: command.workspaceGrantId,
              expectedArtifact: command.artifact,
            },
          );
        }
        case DESKTOP_IPC_CHANNELS.artifactPreview:
          return await this.#previewArtifact(
            ArtifactPreviewQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.artifactHtmlPreview:
          return await this.#startArtifactHtmlPreview(
            ArtifactHtmlPreviewQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.closeArtifactPreview:
          return await this.#closeArtifactPreview(
            CloseArtifactPreviewCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.setArtifactLifecycle:
          return await this.#core.client.setArtifactLifecycle(
            SetArtifactLifecycleCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.deleteArtifactRecord:
          return await this.#core.client.deleteArtifactRecord(
            DeleteArtifactRecordCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.restoreArtifactRecord:
          return await this.#core.client.restoreArtifactRecord(
            RestoreArtifactRecordCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile:
          return await this.#deleteArtifactSourceFile(
            DeleteArtifactSourceFileCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.openArtifactLocation:
          return await this.#openArtifactLocation(
            ArtifactOpenLocationCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.exportArtifact:
          return await this.#exportArtifact(
            ArtifactExportCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.listPendingUserConfirmations:
          return await this.#core.client.listPendingUserConfirmations(
            ListPendingUserConfirmationsQuerySchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.taskControl:
          return await this.#core.client.controlTask(
            TaskControlCommandSchema.parse(input),
          );
        case DESKTOP_IPC_CHANNELS.submitTurn:
          return await this.#core.client.submitTurn(
            await this.#prepareSubmitTurn(SubmitTurnCommandSchema.parse(input)),
          );
        case DESKTOP_IPC_CHANNELS.submitTurnStatus:
          return await this.#core.client.querySubmitTurn(
            SubmitTurnStatusQuerySchema.parse(input),
          );
      }
    } catch (error) {
      const invalid = isContractValidationError(error);
      const coreFailed = this.#core.snapshot?.().runtimeState === "failed";
      return {
        ok: false,
        error: safeError(
          invalid ? "contract.invalid" : "runtime.unavailable",
          invalid
            ? "The Desktop request is invalid."
            : coreFailed
              ? "Core 启动失败，已完成自动恢复尝试，请重新启动 RoboThree。"
              : "The local runtime operation is unavailable.",
          correlationIdOf(input),
          invalid ? "validation" : "availability",
          !invalid && !coreFailed,
        ),
      };
    }
  }

  async #prepareSubmitTurn(
    command: ReturnType<typeof SubmitTurnCommandSchema.parse>,
  ): Promise<ReturnType<typeof SubmitTurnCommandSchema.parse>> {
    if (
      command.selectionRequest.workspaceGrantId !== undefined
      || this.#ensureDefaultWorkspaceGrant === undefined
    ) return command;
    const workspaceGrantId = await this.#ensureDefaultWorkspaceGrant({
      clientInstanceId: command.clientInstanceId,
      correlationId: command.correlationId,
    });
    return SubmitTurnCommandSchema.parse({
      ...command,
      selectionRequest: { ...command.selectionRequest, workspaceGrantId },
    });
  }

  async #createWorkspaceGrant(
    request: CreateWorkspaceGrantFromPickerRequest,
  ): Promise<RendererSafeResult<unknown>> {
    const selectedPath = await this.#chooseWorkspaceDirectory();
    if (selectedPath === undefined) return { ok: true, value: undefined };
    const client = this.#core.client;
    const selection = await client.registerWorkspaceSelection({
      selectedPath,
      clientInstanceId: request.clientInstanceId,
      correlationId: request.correlationId,
    });
    if (!selection.ok) return selection;
    const selectionHandle = selection.value.selectionHandle;
    try {
      return await client.createWorkspaceGrant({
        contractVersion: "v1alpha1",
        type: "create_workspace_grant",
        commandId: request.commandId,
        correlationId: request.correlationId,
        clientInstanceId: request.clientInstanceId,
        selectionHandle,
        displayName: request.displayName,
        accessMode: request.accessMode,
      });
    } finally {
      await client.discardWorkspaceSelection(selectionHandle).catch(() => undefined);
    }
  }

  async #registerWorkspaceArtifactFromPicker(
    command: ReturnType<typeof RegisterWorkspaceArtifactCommandSchema.parse>,
    options: Readonly<{
      workspaceGrantId?: string;
      documentSourcesOnly?: boolean;
      expectedArtifact?: ReturnType<
        typeof WorkbenchAttachmentValidationCommandSchema.parse
      >["artifact"];
    }> = {},
  ): Promise<RendererSafeResult<unknown>> {
    const authoritiesResult = await this.#core.client.listWorkspaceGrantAuthorities({
      correlationId: command.correlationId,
    });
    if (!authoritiesResult.ok) return authoritiesResult;
    const writableAuthorities = authoritiesResult.value
      .filter((authority) => authority.status === "active" && authority.accessMode === "read_write");
    const eligibleAuthorities = options.workspaceGrantId === undefined
      ? writableAuthorities
      : writableAuthorities.filter((authority) =>
        authority.workspaceGrantId === options.workspaceGrantId);
    if (eligibleAuthorities.length === 0) {
      return {
        ok: false,
        error: safeError(
          "workspace.selection_invalid",
          "The selected writable workspace is unavailable.",
          command.correlationId,
          "user_action_required",
          false,
        ),
      };
    }
    const selectedPath = options.expectedArtifact === undefined
      ? options.documentSourcesOnly === true
        ? await this.#chooseWorkspaceArtifactFile(eligibleAuthorities, {
          documentSourcesOnly: true,
        })
        : await this.#chooseWorkspaceArtifactFile(eligibleAuthorities)
      : resolve(
        eligibleAuthorities[0]!.rootRealPath,
        options.expectedArtifact.relativePath ?? "",
      );
    if (selectedPath === undefined) return { ok: true, value: undefined };
    const resolved = await resolveRegisterableWorkspaceFile({
      selectedPath,
      authorities: eligibleAuthorities,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        error: safeError(
          codeForRegistrationFailure(resolved.reason),
          summaryForRegistrationFailure(resolved.reason),
          command.correlationId,
          categoryForRegistrationFailure(resolved.reason),
          false,
        ),
      };
    }
    if (
      options.expectedArtifact !== undefined
      && (
        options.expectedArtifact.sourceKind !== "workspace_file"
        || options.expectedArtifact.relativePath !== resolved.value.relativePath
        || options.expectedArtifact.displayName !== resolved.value.displayName
        || options.expectedArtifact.mediaType !== resolved.value.mediaType
        || options.expectedArtifact.byteSize !== resolved.value.byteSize
      )
    ) {
      return {
        ok: false,
        error: safeError(
          "artifact.source_changed",
          "The selected attachment changed before the task was accepted.",
          command.correlationId,
          "conflict",
          false,
        ),
      };
    }
    const registered = await this.#core.client.registerWorkspaceArtifact({
      command,
      workspaceGrantId: resolved.value.workspaceGrantId,
      relativePath: resolved.value.relativePath,
      fileSha256: resolved.value.fileSha256,
      byteSize: resolved.value.byteSize,
      mediaType: resolved.value.mediaType,
      displayName: resolved.value.displayName,
    });
    if (!registered.ok) return registered;
    if (
      options.expectedArtifact !== undefined
      && (
        registered.value.artifactId !== options.expectedArtifact.artifactId
        || registered.value.artifact.sourceDigest !== options.expectedArtifact.sourceDigest
      )
    ) {
      return {
        ok: false,
        error: safeError(
          "artifact.source_changed",
          "The selected attachment changed before the task was accepted.",
          command.correlationId,
          "conflict",
          false,
        ),
      };
    }
    return {
      ok: true,
      value: RegisterWorkspaceArtifactReceiptSchema.parse(registered.value),
    };
  }

  async #startArtifactHtmlPreview(
    query: ReturnType<typeof ArtifactHtmlPreviewQuerySchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    const workspaceHtml = await this.#startWorkspaceHtmlPreview(query);
    if (workspaceHtml !== undefined) return workspaceHtml;
    const pptxHtml = await this.#startPptxHtmlPreview(query);
    if (pptxHtml !== undefined) return pptxHtml;
    const source = await this.#previewArtifact({
      contractVersion: query.contractVersion,
      type: "artifact_preview",
      queryId: query.queryId,
      correlationId: query.correlationId,
      clientInstanceId: query.clientInstanceId,
      artifactId: query.artifactId,
      mode: "markdown",
      maxBytes: query.maxBytes,
    });
    if (!source.ok) return source;
    try {
      const textPreview = ArtifactTextPreviewProjectionSchema.parse(source.value);
      return {
        ok: true,
        value: await this.#htmlPreviewSandbox.start({
          artifactId: query.artifactId,
          html: htmlPreviewDocumentFromText({
            title: "Artifact Preview",
            content: textPreview.content,
          }),
          ...(query.ttlMs === undefined ? {} : { ttlMs: query.ttlMs }),
        }),
      };
    } catch {
      return {
        ok: false,
        error: safeError(
          "runtime.unavailable",
          "The artifact preview is unavailable.",
          query.correlationId,
          "availability",
          true,
        ),
      };
    }
  }

  async #startPptxHtmlPreview(
    query: ReturnType<typeof ArtifactHtmlPreviewQuerySchema.parse>,
  ): Promise<RendererSafeResult<unknown> | undefined> {
    const source = await this.#core.client.resolveArtifactFileSource({
      artifactId: query.artifactId,
    }).catch(() => undefined);
    if (source === undefined) return undefined;
    if (!source.ok || source.value.taskId === undefined) return undefined;
    if (extensionOf(source.value.relativePath) !== ".pptx") return undefined;
    const resolved = await resolvePreviewableContainedFile({
      rootRealPath: source.value.rootRealPath,
      relativePath: source.value.relativePath,
      maxSourceBytes: MAX_PPTX_HTML_PREVIEW_SOURCE_BYTES,
      allowedExtensions: PPTX_HTML_PREVIEW_EXTENSIONS,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(resolved.reason),
          summaryForPreviewFailure(resolved.reason),
          query.correlationId,
          categoryForPreviewFailure(resolved.reason),
          false,
        ),
      };
    }
    const preview = await renderPptxHtmlPreviewFromFile({
      realPath: resolved.realPath,
      expected: stablePreviewIdentity(resolved.identity),
    });
    if (!preview.ok) {
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(preview.reason),
          summaryForPreviewFailure(preview.reason),
          query.correlationId,
          categoryForPreviewFailure(preview.reason),
          false,
        ),
      };
    }
    try {
      return {
        ok: true,
        value: await this.#htmlPreviewSandbox.start({
          artifactId: query.artifactId,
          html: preview.value.html,
          ...(query.ttlMs === undefined ? {} : { ttlMs: query.ttlMs }),
        }),
      };
    } catch {
      return {
        ok: false,
        error: safeError(
          "runtime.unavailable",
          "The artifact preview is unavailable.",
          query.correlationId,
          "availability",
          true,
        ),
      };
    }
  }

  async #previewArtifact(
    query: ReturnType<typeof ArtifactPreviewQuerySchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    const corePreview = await this.#core.client.previewArtifact(query);
    if (corePreview.ok) return corePreview;
    const workspacePreview = await this.#previewManualWorkspaceFileArtifact(query);
    return workspacePreview ?? corePreview;
  }

  async #previewManualWorkspaceFileArtifact(
    query: ReturnType<typeof ArtifactPreviewQuerySchema.parse>,
  ): Promise<RendererSafeResult<unknown> | undefined> {
    const source = await this.#core.client.resolveArtifactFileSource({
      artifactId: query.artifactId,
    }).catch(() => undefined);
    if (source === undefined) return undefined;
    if (!source.ok || source.value.taskId !== undefined) return undefined;
    const resolved = await resolvePreviewableContainedFile({
      rootRealPath: source.value.rootRealPath,
      relativePath: source.value.relativePath,
      maxSourceBytes: MAX_WORKSPACE_FILE_PREVIEW_SOURCE_BYTES,
      allowedExtensions: WORKSPACE_TEXT_PREVIEW_EXTENSIONS,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(resolved.reason),
          summaryForPreviewFailure(resolved.reason),
          query.correlationId,
          categoryForPreviewFailure(resolved.reason),
          false,
        ),
      };
    }
    const preview = await readStableFilePreview({
      realPath: resolved.realPath,
      expected: resolved.identity,
      maxBytes: query.maxBytes,
    });
    if (!preview.ok) {
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(preview.reason),
          summaryForPreviewFailure(preview.reason),
          query.correlationId,
          categoryForPreviewFailure(preview.reason),
          false,
        ),
      };
    }
    return {
      ok: true,
      value: ArtifactTextPreviewProjectionSchema.parse({
        artifactId: query.artifactId,
        mode: query.mode,
        content: preview.value.content,
        byteSize: preview.value.byteSize,
        truncated: preview.value.truncated,
        warnings: preview.value.truncated ? ["Preview truncated to the requested byte budget."] : [],
      }),
    };
  }

  async #startWorkspaceHtmlPreview(
    query: ReturnType<typeof ArtifactHtmlPreviewQuerySchema.parse>,
  ): Promise<RendererSafeResult<unknown> | undefined> {
    const source = await this.#core.client.resolveArtifactFileSource({
      artifactId: query.artifactId,
    }).catch(() => undefined);
    if (source === undefined) return undefined;
    if (!source.ok) return undefined;
    const resolved = await resolvePreviewableContainedFile({
      rootRealPath: source.value.rootRealPath,
      relativePath: source.value.relativePath,
      maxSourceBytes: MAX_WORKSPACE_HTML_PREVIEW_BYTES,
      allowedExtensions: WORKSPACE_HTML_PREVIEW_EXTENSIONS,
    });
    if (!resolved.ok) {
      if (resolved.reason === "unsupported") return undefined;
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(resolved.reason),
          summaryForPreviewFailure(resolved.reason),
          query.correlationId,
          categoryForPreviewFailure(resolved.reason),
          false,
        ),
      };
    }
    const html = await readStableFilePreview({
      realPath: resolved.realPath,
      expected: resolved.identity,
      maxBytes: Math.min(query.maxBytes, MAX_WORKSPACE_HTML_PREVIEW_BYTES),
      safeSummary: false,
    });
    if (!html.ok) {
      return {
        ok: false,
        error: safeError(
          codeForPreviewFailure(html.reason),
          summaryForPreviewFailure(html.reason),
          query.correlationId,
          categoryForPreviewFailure(html.reason),
          false,
        ),
      };
    }
    try {
      return {
        ok: true,
        value: await this.#htmlPreviewSandbox.start({
          artifactId: query.artifactId,
          html: html.value.content,
          ...(query.ttlMs === undefined ? {} : { ttlMs: query.ttlMs }),
        }),
      };
    } catch {
      return {
        ok: false,
        error: safeError(
          "runtime.unavailable",
          "The artifact preview is unavailable.",
          query.correlationId,
          "availability",
          true,
        ),
      };
    }
  }

  async #closeArtifactPreview(
    command: ReturnType<typeof CloseArtifactPreviewCommandSchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    return {
      ok: true,
      value: await this.#htmlPreviewSandbox.close(
        command.previewSessionId,
        command.commandId,
      ),
    };
  }

  async #openArtifactLocation(
    command: ReturnType<typeof ArtifactOpenLocationCommandSchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    const source = await this.#core.client.resolveArtifactFileSource({
      artifactId: command.artifactId,
    });
    if (!source.ok) return source;
    const resolved = await resolveContainedFile({
      rootRealPath: source.value.rootRealPath,
      relativePath: source.value.relativePath,
    });
    if (resolved === undefined) {
      return {
        ok: false,
        error: safeError(
          "task.not_found",
          "The artifact file is unavailable.",
          command.correlationId,
          "availability",
          false,
        ),
      };
    }
    await this.#openFileLocation(resolved.realPath);
    return {
      ok: true,
      value: ArtifactOpenLocationReceiptSchema.parse({
        commandId: command.commandId,
        artifactId: command.artifactId,
        opened: true,
      }),
    };
  }

  async #exportArtifact(
    command: ReturnType<typeof ArtifactExportCommandSchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    const source = await this.#core.client.resolveArtifactFileSource({
      artifactId: command.artifactId,
    });
    if (!source.ok) return source;
    const resolved = await resolveContainedFile({
      rootRealPath: source.value.rootRealPath,
      relativePath: source.value.relativePath,
    });
    if (resolved === undefined) {
      return {
        ok: false,
        error: safeError(
          "task.not_found",
          "The artifact file is unavailable.",
          command.correlationId,
          "availability",
          false,
        ),
      };
    }
    const targetPath = await this.#chooseArtifactExportPath(source.value.displayName);
    if (targetPath === undefined) {
      return {
        ok: true,
        value: ArtifactExportReceiptSchema.parse({
          commandId: command.commandId,
          artifactId: command.artifactId,
          exported: false,
        }),
      };
    }
    const exported = await copyNoClobberAtomic({
      sourceRealPath: resolved.realPath,
      targetPath,
    });
    if (!exported.ok) {
      return {
        ok: false,
        error: safeError(
          exported.reason === "target_exists" ? "command.idempotency_conflict" : "runtime.unavailable",
          exported.reason === "target_exists"
            ? "The export target already exists."
            : "The artifact could not be exported.",
          command.correlationId,
          exported.reason === "target_exists" ? "conflict" : "availability",
          false,
        ),
      };
    }
    return {
      ok: true,
      value: ArtifactExportReceiptSchema.parse({
        commandId: command.commandId,
        artifactId: command.artifactId,
        exported: true,
        fileName: basename(exported.targetRealPath),
      }),
    };
  }

  async #deleteArtifactSourceFile(
    command: ReturnType<typeof DeleteArtifactSourceFileCommandSchema.parse>,
  ): Promise<RendererSafeResult<unknown>> {
    const prepared = await this.#core.client.prepareArtifactSourceFileDeletion(command);
    if (!prepared.ok) return prepared;
    if ("sourceFileDeleted" in prepared.value) {
      return { ok: true, value: prepared.value };
    }
    const resolved = await resolveDeletableContainedFile({
      rootRealPath: prepared.value.rootRealPath,
      relativePath: prepared.value.relativePath,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        error: safeError(
          resolved.reason === "unsupported"
            ? "artifact.delete_unsupported"
            : resolved.reason === "changed"
              ? "artifact.source_changed"
              : "artifact.source_unavailable",
          resolved.reason === "unsupported"
            ? "This artifact source cannot be moved to Trash."
            : resolved.reason === "changed"
              ? "The artifact source changed before deletion."
              : "The artifact source file is unavailable.",
          command.correlationId,
          resolved.reason === "changed" ? "conflict" : "validation",
          false,
        ),
      };
    }
    try {
      await this.#trashArtifactSourceFile(resolved.realPath);
    } catch {
      return {
        ok: false,
        error: safeError(
          "artifact.delete_unsupported",
          "Moving this artifact to Trash is not supported on this system.",
          command.correlationId,
          "availability",
          false,
        ),
      };
    }
    const postcondition = await sourcePathUnavailable(resolved.originalPath);
    if (!postcondition) {
      return {
        ok: false,
        error: safeError(
          "artifact.delete_uncertain",
          "The artifact source deletion needs manual attention.",
          command.correlationId,
          "uncertain",
          false,
        ),
      };
    }
    return await this.#core.client.commitArtifactSourceFileDeletion(command);
  }
}

function projectRegisterWorkspaceArtifactCommand(command: Readonly<{
  contractVersion: "v1alpha1";
  type: "register_workspace_artifact";
  commandId: string;
  correlationId: string;
  clientInstanceId: string;
}>) {
  return RegisterWorkspaceArtifactCommandSchema.parse({
    contractVersion: command.contractVersion,
    type: command.type,
    commandId: command.commandId,
    correlationId: command.correlationId,
    clientInstanceId: command.clientInstanceId,
  });
}

const MAX_REGISTER_BYTES = 256 * 1024 * 1024;
const HASH_CHUNK_BYTES = 64 * 1024;
const MAX_WORKSPACE_FILE_PREVIEW_SOURCE_BYTES = 1 * 1024 * 1024;
const MAX_WORKSPACE_HTML_PREVIEW_BYTES = 256 * 1024;
const MAX_PPTX_HTML_PREVIEW_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_DESKTOP_SAFE_SUMMARY_BYTES = 4096;
const WORKSPACE_TEXT_PREVIEW_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
]);
const WORKSPACE_HTML_PREVIEW_EXTENSIONS = new Set([".html", ".htm"]);
const PPTX_HTML_PREVIEW_EXTENSIONS = new Set([".pptx"]);

type RegistrationFailureReason =
  | "outside_workspace"
  | "unsupported_file"
  | "source_unavailable"
  | "source_changed"
  | "too_large";

type PreviewFailureReason =
  | "outside_workspace"
  | "unsupported"
  | "source_unavailable"
  | "source_changed"
  | "too_large";

const SUPPORTED_REGISTER_MEDIA = new Map<string, {
  mediaType: string;
}>([
  [".pdf", { mediaType: "application/pdf" }],
  [".xlsx", {
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }],
  [".docx", {
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }],
  [".md", { mediaType: "text/markdown" }],
  [".markdown", { mediaType: "text/markdown" }],
  [".txt", { mediaType: "text/plain" }],
  [".html", { mediaType: "text/html" }],
  [".htm", { mediaType: "text/html" }],
]);

async function resolveRegisterableWorkspaceFile(input: {
  selectedPath: string;
  authorities: readonly {
    workspaceGrantId: string;
    rootRealPath: string;
  }[];
}): Promise<
  | {
    ok: true;
    value: {
      workspaceGrantId: string;
      relativePath: string;
      fileSha256: string;
      byteSize: number;
      mediaType: string;
      displayName: string;
    };
  }
  | { ok: false; reason: RegistrationFailureReason }
> {
  if (hasUnsafeAbsolutePathShape(input.selectedPath)) {
    return { ok: false, reason: "outside_workspace" };
  }
  try {
    const selectedLinkInfo = await lstat(input.selectedPath);
    if (selectedLinkInfo.isSymbolicLink() || !selectedLinkInfo.isFile()) {
      return { ok: false, reason: "unsupported_file" };
    }
    if (selectedLinkInfo.nlink > 1) {
      return { ok: false, reason: "unsupported_file" };
    }
    if (selectedLinkInfo.size > MAX_REGISTER_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    const selectedRealPath = await realpath(input.selectedPath);
    const realInfo = await stat(selectedRealPath);
    if (!sameFileIdentity(selectedLinkInfo, realInfo)) {
      return { ok: false, reason: "source_changed" };
    }
    const authority = await selectContainingAuthority({
      selectedRealPath,
      authorities: input.authorities,
    });
    if (authority === undefined) return { ok: false, reason: "outside_workspace" };
    const displayName = basename(selectedRealPath);
    const media = SUPPORTED_REGISTER_MEDIA.get(extensionOf(displayName));
    if (media === undefined) return { ok: false, reason: "unsupported_file" };
    const relativePath = relative(authority.rootRealPath, selectedRealPath).split(sep).join("/");
    if (!isSafeRelativePath(relativePath)) return { ok: false, reason: "outside_workspace" };
    const digest = await hashStableFile({
      realPath: selectedRealPath,
      expected: selectedLinkInfo,
    });
    if (!digest.ok) return digest;
    return {
      ok: true,
      value: {
        workspaceGrantId: authority.workspaceGrantId,
        relativePath,
        fileSha256: digest.value.fileSha256,
        byteSize: digest.value.byteSize,
        mediaType: media.mediaType,
        displayName,
      },
    };
  } catch {
    return { ok: false, reason: "source_unavailable" };
  }
}

async function selectContainingAuthority(input: {
  selectedRealPath: string;
  authorities: readonly { workspaceGrantId: string; rootRealPath: string }[];
}): Promise<{ workspaceGrantId: string; rootRealPath: string } | undefined> {
  for (const authority of input.authorities) {
    if (hasUnsafeAbsolutePathShape(authority.rootRealPath)) continue;
    const rootRealPath = await realpath(authority.rootRealPath).catch(() => undefined);
    if (rootRealPath === undefined) continue;
    if (isContained(rootRealPath, input.selectedRealPath)) {
      return { workspaceGrantId: authority.workspaceGrantId, rootRealPath };
    }
  }
  return undefined;
}

async function hashStableFile(input: {
  realPath: string;
  expected: Awaited<ReturnType<typeof lstat>>;
}): Promise<
  | { ok: true; value: { fileSha256: string; byteSize: number } }
  | { ok: false; reason: "source_changed" | "source_unavailable" | "too_large" }
> {
  const handle = await open(input.realPath, "r");
  try {
    const before = await handle.stat();
    if (!sameFileIdentity(input.expected, before)) {
      return { ok: false, reason: "source_changed" };
    }
    if (!before.isFile()) return { ok: false, reason: "source_unavailable" };
    if (before.size > MAX_REGISTER_BYTES) return { ok: false, reason: "too_large" };
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    let offset = 0;
    while (offset < before.size) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, before.size - offset),
        offset,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (offset !== before.size) return { ok: false, reason: "source_changed" };
    const after = await handle.stat();
    if (!sameStableFile(before, after)) return { ok: false, reason: "source_changed" };
    return {
      ok: true,
      value: {
        fileSha256: hash.digest("hex"),
        byteSize: before.size,
      },
    };
  } finally {
    await handle.close();
  }
}

function sameFileIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof stat>>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(
  left: Awaited<ReturnType<typeof stat>>,
  right: Awaited<ReturnType<typeof stat>>,
): boolean {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function stablePreviewIdentity(input: Awaited<ReturnType<typeof lstat>>): StableFileIdentity {
  return {
    dev: Number(input.dev),
    ino: Number(input.ino),
    size: Number(input.size),
    mtimeMs: Number(input.mtimeMs),
  };
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index).toLowerCase();
}

function hasUnsafeAbsolutePathShape(value: string): boolean {
  return value.includes("\0") || value.startsWith("//") || /^\\\\|^[a-zA-Z]:[\\/]/u.test(value);
}

function codeForRegistrationFailure(
  reason: RegistrationFailureReason,
): DesktopErrorEnvelope["code"] {
  switch (reason) {
    case "outside_workspace":
      return "workspace.boundary_violation";
    case "source_changed":
      return "artifact.source_changed";
    case "too_large":
    case "unsupported_file":
    case "source_unavailable":
      return "artifact.source_unavailable";
    default:
      return assertNever(reason);
  }
}

function categoryForRegistrationFailure(
  reason: RegistrationFailureReason,
): DesktopErrorEnvelope["category"] {
  switch (reason) {
    case "outside_workspace":
      return "workspace_boundary";
    case "source_changed":
      return "conflict";
    case "too_large":
    case "unsupported_file":
    case "source_unavailable":
      return "validation";
    default:
      return assertNever(reason);
  }
}

function summaryForRegistrationFailure(reason: RegistrationFailureReason): string {
  switch (reason) {
    case "outside_workspace":
      return "The selected file is outside the authorized workspace.";
    case "unsupported_file":
      return "The selected file type cannot be registered yet.";
    case "source_unavailable":
      return "The selected file is unavailable.";
    case "source_changed":
      return "The selected file changed during registration.";
    case "too_large":
      return "The selected file is too large to register.";
    default:
      return assertNever(reason);
  }
}

async function resolveContainedFile(input: {
  rootRealPath: string;
  relativePath: string;
}): Promise<{ realPath: string } | undefined> {
  try {
    if (!isSafeRelativePath(input.relativePath)) return undefined;
    const rootRealPath = await realpath(input.rootRealPath);
    const candidate = await realpath(join(rootRealPath, input.relativePath));
    if (!isContained(rootRealPath, candidate)) return undefined;
    const info = await stat(candidate);
    return info.isFile() ? { realPath: candidate } : undefined;
  } catch {
    return undefined;
  }
}

async function resolvePreviewableContainedFile(input: {
  rootRealPath: string;
  relativePath: string;
  maxSourceBytes: number;
  allowedExtensions: ReadonlySet<string>;
}): Promise<
  | {
    ok: true;
    realPath: string;
    identity: Awaited<ReturnType<typeof lstat>>;
  }
  | { ok: false; reason: PreviewFailureReason }
> {
  try {
    if (!isSafeRelativePath(input.relativePath)) {
      return { ok: false, reason: "outside_workspace" };
    }
    if (!input.allowedExtensions.has(extensionOf(input.relativePath))) {
      return { ok: false, reason: "unsupported" };
    }
    const rootRealPath = await realpath(input.rootRealPath);
    const originalPath = join(rootRealPath, input.relativePath);
    const linkInfo = await lstat(originalPath);
    if (linkInfo.isSymbolicLink() || !linkInfo.isFile() || linkInfo.nlink > 1) {
      return { ok: false, reason: "unsupported" };
    }
    if (linkInfo.size > input.maxSourceBytes) return { ok: false, reason: "too_large" };
    const realPath = await realpath(originalPath);
    if (!isContained(rootRealPath, realPath)) return { ok: false, reason: "outside_workspace" };
    const realInfo = await stat(realPath);
    if (!realInfo.isFile()) return { ok: false, reason: "unsupported" };
    if (!sameFileIdentity(linkInfo, realInfo)) return { ok: false, reason: "source_changed" };
    return { ok: true, realPath, identity: linkInfo };
  } catch {
    return { ok: false, reason: "source_unavailable" };
  }
}

async function readStableFilePreview(input: {
  realPath: string;
  expected: Awaited<ReturnType<typeof lstat>>;
  maxBytes: number;
  safeSummary?: boolean;
}): Promise<
  | { ok: true; value: { content: string; byteSize: number; truncated: boolean } }
  | { ok: false; reason: "source_unavailable" | "source_changed" }
> {
  const byteLimit = input.safeSummary === false
    ? input.maxBytes
    : Math.min(input.maxBytes, MAX_DESKTOP_SAFE_SUMMARY_BYTES);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(input.realPath, "r");
    const before = await handle.stat();
    if (!sameFileIdentity(input.expected, before) || !before.isFile()) {
      return { ok: false, reason: "source_changed" };
    }
    const readLimit = Math.min(byteLimit + 1, before.size);
    const buffer = Buffer.allocUnsafe(readLimit);
    let offset = 0;
    while (offset < readLimit) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        readLimit - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (!sameStableFile(before, after)) return { ok: false, reason: "source_changed" };
    const truncated = before.size > byteLimit || offset > byteLimit;
    const content = boundUtf8ForPreview(buffer.subarray(0, Math.min(offset, byteLimit)), byteLimit);
    return {
      ok: true,
      value: {
        content,
        byteSize: new TextEncoder().encode(content).byteLength,
        truncated,
      },
    };
  } catch {
    return { ok: false, reason: "source_unavailable" };
  } finally {
    await handle?.close();
  }
}

function boundUtf8ForPreview(bytes: Uint8Array, maxBytes: number): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const encoder = new TextEncoder();
  let text = sanitizePreviewContent(decoder.decode(bytes.subarray(0, maxBytes)));
  while (encoder.encode(text).byteLength > maxBytes) {
    text = text.slice(0, -1);
  }
  return text;
}

function sanitizePreviewContent(input: string): string {
  let output = "";
  for (const char of input) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint === 0) {
      output += "\uFFFD";
      continue;
    }
    if (
      (codePoint >= 1 && codePoint <= 8)
      || codePoint === 11
      || codePoint === 12
      || (codePoint >= 14 && codePoint <= 31)
      || codePoint === 127
    ) {
      continue;
    }
    output += char;
  }
  return output;
}

function codeForPreviewFailure(reason: PreviewFailureReason): DesktopErrorEnvelope["code"] {
  switch (reason) {
    case "outside_workspace":
      return "workspace.boundary_violation";
    case "source_changed":
      return "artifact.source_changed";
    case "too_large":
    case "unsupported":
    case "source_unavailable":
      return "artifact.source_unavailable";
    default:
      return assertNever(reason);
  }
}

function categoryForPreviewFailure(reason: PreviewFailureReason): DesktopErrorEnvelope["category"] {
  switch (reason) {
    case "outside_workspace":
      return "workspace_boundary";
    case "source_changed":
      return "conflict";
    case "too_large":
    case "unsupported":
    case "source_unavailable":
      return "validation";
    default:
      return assertNever(reason);
  }
}

function summaryForPreviewFailure(reason: PreviewFailureReason): string {
  switch (reason) {
    case "outside_workspace":
      return "The artifact file is outside the authorized workspace.";
    case "unsupported":
      return "This artifact file cannot be previewed yet.";
    case "source_unavailable":
      return "The artifact file is unavailable.";
    case "source_changed":
      return "The artifact file changed before preview.";
    case "too_large":
      return "The artifact file is too large to preview.";
    default:
      return assertNever(reason);
  }
}

async function resolveDeletableContainedFile(input: {
  rootRealPath: string;
  relativePath: string;
}): Promise<
  | { ok: true; realPath: string; originalPath: string }
  | { ok: false; reason: "unavailable" | "changed" | "unsupported" }
> {
  try {
    if (!isSafeRelativePath(input.relativePath)) {
      return { ok: false, reason: "unavailable" };
    }
    const rootRealPath = await realpath(input.rootRealPath);
    const originalPath = join(rootRealPath, input.relativePath);
    const linkInfo = await lstat(originalPath);
    if (linkInfo.isSymbolicLink()) return { ok: false, reason: "unsupported" };
    if (!linkInfo.isFile()) return { ok: false, reason: "unsupported" };
    if (linkInfo.nlink > 1) return { ok: false, reason: "unsupported" };
    const realPath = await realpath(originalPath);
    if (!isContained(rootRealPath, realPath)) return { ok: false, reason: "changed" };
    const realInfo = await stat(realPath);
    if (!realInfo.isFile()) return { ok: false, reason: "unsupported" };
    if (realInfo.dev !== linkInfo.dev || realInfo.ino !== linkInfo.ino) {
      return { ok: false, reason: "changed" };
    }
    return { ok: true, realPath, originalPath };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

async function sourcePathUnavailable(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error.code === "ENOENT" || error.code === "ENOTDIR");
  }
}

async function copyNoClobberAtomic(input: {
  sourceRealPath: string;
  targetPath: string;
}): Promise<
  | { ok: true; targetRealPath: string }
  | { ok: false; reason: "target_exists" | "invalid_target" | "publish_failed" }
> {
  let targetDirectoryRealPath: string;
  try {
    targetDirectoryRealPath = await realpath(dirname(input.targetPath));
  } catch {
    return { ok: false, reason: "invalid_target" };
  }
  const targetName = basename(input.targetPath);
  if (
    targetName.length === 0
    || targetName === "."
    || targetName === ".."
    || targetName.includes("\0")
  ) return { ok: false, reason: "invalid_target" };
  const targetRealPath = join(targetDirectoryRealPath, targetName);
  try {
    await stat(targetRealPath);
    return { ok: false, reason: "target_exists" };
  } catch {
    // Missing target is the only acceptable precondition for no-clobber export.
  }
  const tempPath = join(
    targetDirectoryRealPath,
    `.robothree-export-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  let tempCreated = false;
  try {
    await copyFile(input.sourceRealPath, tempPath, fsConstants.COPYFILE_EXCL);
    tempCreated = true;
    const handle = await open(tempPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(tempPath, targetRealPath);
    await fsyncDirectoryBestEffort(targetDirectoryRealPath);
    await rm(tempPath, { force: true });
    await fsyncDirectoryBestEffort(targetDirectoryRealPath);
    return { ok: true, targetRealPath };
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "EEXIST"
    ) return { ok: false, reason: "target_exists" };
    return { ok: false, reason: "publish_failed" };
  } finally {
    if (tempCreated) await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function fsyncDirectoryBestEffort(directory: string): Promise<void> {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some platforms/filesystems do not allow directory fsync from Node.
  }
}

function isContained(rootRealPath: string, candidateRealPath: string): boolean {
  const normalizedRoot = normalize(rootRealPath);
  const normalizedCandidate = normalize(candidateRealPath);
  const rel = relative(normalizedRoot, normalizedCandidate);
  return rel.length === 0 || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !rel.startsWith(sep));
}

function isSafeRelativePath(value: string): boolean {
  if (value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || value.startsWith("//")) return false;
  if (/^[a-zA-Z]:/u.test(value)) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== "..");
}

function parsePickerRequest(
  input: unknown,
): CreateWorkspaceGrantFromPickerRequest {
  if (!isRecord(input)) throw new Error("Invalid picker request");
  const keys = Object.keys(input);
  if (
    keys.length !== 5
    || !keys.every((key) => [
      "commandId",
      "correlationId",
      "clientInstanceId",
      "displayName",
      "accessMode",
    ].includes(key))
  ) throw new Error("Invalid picker request keys");
  return {
    commandId: EntityIdSchema.parse(input.commandId),
    correlationId: EntityIdSchema.parse(input.correlationId),
    clientInstanceId: EntityIdSchema.parse(input.clientInstanceId),
    displayName: DesktopDisplayTextSchema.parse(input.displayName),
    accessMode: WorkspaceAccessModeSchema.parse(input.accessMode),
  };
}

function correlationIdOf(input: unknown): string {
  if (isRecord(input)) {
    const parsed = EntityIdSchema.safeParse(input.correlationId);
    if (parsed.success) return parsed.data;
  }
  return "00000000-0000-4000-8000-000000000000";
}

function safeError(
  code: DesktopErrorEnvelope["code"],
  safeSummary: string,
  correlationId: string,
  category: DesktopErrorEnvelope["category"],
  retryable: boolean,
): DesktopErrorEnvelope {
  return DesktopErrorEnvelopeSchema.parse({
    contractVersion: "v1alpha1",
    code,
    category,
    safeSummary,
    retryable,
    correlationId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContractValidationError(value: unknown): boolean {
  return isRecord(value)
    && value.name === "ZodError"
    && Array.isArray(value.issues);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Desktop IPC value: ${String(value)}`);
}
