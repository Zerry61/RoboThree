import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CreateSkillDraftWorkspaceCommandSchema,
  CreateSkillDraftWorkspaceReceiptSchema,
  RefreshSkillDraftCommandSchema,
  SkillLifecycleMutationReceiptSchema,
  type CreateSkillDraftWorkspaceCommand,
  type CreateSkillDraftWorkspaceReceipt,
  type RefreshSkillDraftCommand,
  type SkillLifecycleMutationReceipt,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

import type { CorePrivateClient } from "./core-private-client.js";

type DraftState = Readonly<{
  format: "robothree.skill-draft-state.v1";
  draftId: string;
  skillId: string;
  workspaceGrantId: string;
  displayName: string;
  currentRevision: string;
  material: Readonly<{
    skillId: string;
    technicalName: string;
    displayTitle: string;
    displayDescription: string;
    primaryFunction: string;
  }>;
}>;

type WorkspaceClient = Pick<CorePrivateClient,
  "createWorkspaceGrant" | "discardWorkspaceSelection" | "listWorkspaceGrantAuthorities"
  | "registerWorkspaceSelection" | "revokeWorkspaceGrant" | "syncSkillDraftV1Alpha1">;

export class SkillDraftWorkspaceService {
  readonly #root: string;
  readonly #stateRoot: string;
  readonly #onSynced: (() => Promise<void>) | undefined;

  constructor(input: Readonly<{ privateRootPath: string; onSynced?: () => Promise<void> }>) {
    this.#root = join(input.privateRootPath, "skills", "drafts");
    this.#stateRoot = join(input.privateRootPath, "skills", ".state", "drafts");
    this.#onSynced = input.onSynced;
  }

  async create(command: CreateSkillDraftWorkspaceCommand, input: Readonly<{
    client: WorkspaceClient;
    clientInstanceId: string;
  }>): Promise<CreateSkillDraftWorkspaceReceipt> {
    const parsed = CreateSkillDraftWorkspaceCommandSchema.parse(command);
    const draftId = randomUUID();
    const skillId = `skill.personal.${draftId}`;
    const technicalName = `skill-${draftId.slice(0, 12)}`;
    const root = join(this.#root, draftId);
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await mkdir(root, { recursive: false, mode: 0o700 });
    let workspaceGrantId: string | undefined;
    try {
      const markdown = initialSkillMarkdown({
        technicalName,
        description: parsed.displayDescription,
        primaryFunction: parsed.primaryFunction,
      });
      await writeFile(join(root, "SKILL.md"), markdown, { encoding: "utf8", flag: "wx", mode: 0o600 });
      workspaceGrantId = await createGrant(input.client, {
        root,
        clientInstanceId: input.clientInstanceId,
        correlationId: parsed.correlationId,
        displayName: parsed.displayTitle,
      });
      const material = {
        skillId,
        technicalName,
        displayTitle: parsed.displayTitle,
        displayDescription: parsed.displayDescription,
        primaryFunction: parsed.primaryFunction,
      };
      const synced = await input.client.syncSkillDraftV1Alpha1({
        commandId: parsed.commandId,
        correlationId: parsed.correlationId,
        workspaceGrantId,
        skillId,
        material,
      });
      if (!synced.ok) throw synced.error;
      // The seed exists only to create Central's first immutable revision. Removing it
      // preserves WFW's rule that the creator Task must own its first SKILL.md via create_new.
      await rm(join(root, "SKILL.md"), { force: false });
      const state = parseDraftState({
        format: "robothree.skill-draft-state.v1",
        draftId,
        skillId,
        workspaceGrantId,
        displayName: parsed.displayTitle,
        currentRevision: synced.value.currentRevision,
        material,
      });
      await persistState(this.#statePath(draftId), state);
      await this.#onSynced?.();
      return CreateSkillDraftWorkspaceReceiptSchema.parse({
        ...synced.value,
        state: "draft_created",
        draftId,
        workspaceGrantId,
        displayName: parsed.displayTitle,
      });
    } catch (error) {
      if (workspaceGrantId !== undefined) {
        await input.client.revokeWorkspaceGrant({
          contractVersion: "v1alpha1",
          type: "revoke_workspace_grant",
          commandId: randomUUID(),
          correlationId: parsed.correlationId,
          clientInstanceId: input.clientInstanceId,
          workspaceGrantId,
        }).catch(() => undefined);
      }
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async refresh(command: RefreshSkillDraftCommand, input: Readonly<{
    client: WorkspaceClient;
  }>): Promise<SkillLifecycleMutationReceipt> {
    const parsed = RefreshSkillDraftCommandSchema.parse(command);
    const state = await this.#findBySkillId(parsed.skillId);
    if (state.currentRevision !== parsed.expectedDraftRevision) {
      throw skillError("skilllifecycle.revision_conflict", parsed.correlationId, false);
    }
    const technicalName = await readSkillTechnicalName(
      join(this.#root, state.draftId, "SKILL.md"),
    );
    const synced = await input.client.syncSkillDraftV1Alpha1({
      commandId: parsed.commandId,
      correlationId: parsed.correlationId,
      workspaceGrantId: state.workspaceGrantId,
      skillId: state.skillId,
      expectedDraftRevision: parsed.expectedDraftRevision,
      material: { ...state.material, technicalName },
    });
    if (!synced.ok) throw synced.error;
    await persistState(this.#statePath(state.draftId), {
      ...state,
      currentRevision: synced.value.currentRevision,
      material: { ...state.material, technicalName },
    });
    await this.#onSynced?.();
    return SkillLifecycleMutationReceiptSchema.parse(synced.value);
  }

  async #findBySkillId(skillId: string): Promise<DraftState> {
    const { readdir } = await import("node:fs/promises");
    await mkdir(this.#stateRoot, { recursive: true, mode: 0o700 });
    const names = await readdir(this.#stateRoot);
    for (const name of names.sort()) {
      if (!name.endsWith(".json")) continue;
      const parsed = parseDraftStateOrUndefined(JSON.parse(
        await readFile(join(this.#stateRoot, name), "utf8")));
      if (parsed !== undefined && parsed.skillId === skillId) return parsed;
    }
    throw skillError("skilllifecycle.not_found", randomUUID(), false);
  }

  #statePath(draftId: string): string {
    return join(this.#stateRoot, `${draftId}.json`);
  }
}

async function readSkillTechnicalName(path: string): Promise<string> {
  const markdown = await readFile(path, "utf8");
  if (markdown.includes("\uFFFD") || markdown.charCodeAt(0) === 0xfeff
    || Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const normalized = markdown.replace(/\r\n?/gu, "\n");
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized)?.[1];
  if (frontmatter === undefined) throw new Error("skilllifecycle.package_invalid");
  const names = frontmatter.split("\n").filter((line) => line.startsWith("name:"));
  if (names.length !== 1) throw new Error("skilllifecycle.package_invalid");
  const name = names[0]!.slice("name:".length).trim();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name)
    || name.length < 3 || name.length > 64) {
    throw new Error("skilllifecycle.package_invalid");
  }
  return name;
}

async function createGrant(client: WorkspaceClient, input: Readonly<{
  root: string;
  clientInstanceId: string;
  correlationId: string;
  displayName: string;
}>): Promise<string> {
  const canonicalRoot = await realpath(input.root);
  const selection = await client.registerWorkspaceSelection({
    selectedPath: canonicalRoot,
    clientInstanceId: input.clientInstanceId,
    correlationId: input.correlationId,
  });
  if (!selection.ok) throw new Error("skilllifecycle.service_unavailable");
  try {
    const created = await client.createWorkspaceGrant({
      contractVersion: "v1alpha1",
      type: "create_workspace_grant",
      commandId: randomUUID(),
      correlationId: input.correlationId,
      clientInstanceId: input.clientInstanceId,
      selectionHandle: selection.value.selectionHandle,
      displayName: input.displayName,
      accessMode: "read_write",
    });
    if (!created.ok) throw new Error("skilllifecycle.service_unavailable");
    return created.value.workspaceGrantId;
  } finally {
    await client.discardWorkspaceSelection(selection.value.selectionHandle).catch(() => undefined);
  }
}

async function persistState(path: string, state: DraftState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(parseDraftState(state)), {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  await rename(temp, path);
}

function parseDraftStateOrUndefined(value: unknown): DraftState | undefined {
  try {
    return parseDraftState(value);
  } catch {
    return undefined;
  }
}

function parseDraftState(value: unknown): DraftState {
  if (!isRecord(value) || Object.keys(value).length !== 7
    || value.format !== "robothree.skill-draft-state.v1"
    || !isUuid(value.draftId) || typeof value.skillId !== "string"
    || typeof value.workspaceGrantId !== "string" || typeof value.displayName !== "string"
    || typeof value.currentRevision !== "string" || !isRecord(value.material)
    || Object.keys(value.material).length !== 5
    || typeof value.material.skillId !== "string"
    || typeof value.material.technicalName !== "string"
    || typeof value.material.displayTitle !== "string"
    || typeof value.material.displayDescription !== "string"
    || typeof value.material.primaryFunction !== "string") {
    throw new Error("skilllifecycle.draft_state_invalid");
  }
  return value as DraftState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function initialSkillMarkdown(input: Readonly<{
  technicalName: string;
  description: string;
  primaryFunction: string;
}>): string {
  const description = input.description.replace(/\s+/gu, " ").replace(/["']/gu, "").trim();
  return `---\nname: ${input.technicalName}\ndescription: ${description}\n---\n\n`
    + `# ${input.technicalName}\n\n${input.primaryFunction.trim()}\n`;
}

function skillError(errorCode: string, correlationId: string, retryable: boolean) {
  return {
    contractVersion: "skill-lifecycle.v1alpha1" as const,
    errorCode,
    safeSummary: errorCode === "skilllifecycle.revision_conflict"
      ? "技能草稿已更新，请刷新后重试。" : "未找到技能草稿工作区。",
    correlationId,
    retryable,
  };
}
