import { z } from "zod";
import {
  ArtifactTextPreviewProjectionSchema,
  JsonObjectSchema,
  JsonValueSchema,
  type ArtifactPreviewMode,
  type ArtifactTextPreviewProjection,
  type JsonObject,
  type Observation,
  type TaskRunState,
} from "@robothree/contracts";

import {
  isDocumentToolCapabilityId,
} from "./document-tool-context.js";
import type { DocumentToolCapabilityId } from "../registry/document-tool-registry.js";
import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker";
import type { PersistedTask } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export const ARTIFACT_PREVIEW_SCHEMA_VERSION =
  "robothree-artifact-preview/v1alpha1" as const;

export const ArtifactPreviewKindSchema = z.enum([
  "document",
  "spreadsheet",
  "markdown",
  "html",
  "text",
  "image",
  "unknown",
]);

export const ArtifactPreviewStateSchema = z.enum([
  "available",
  "unsupported",
  "too_large",
  "blocked",
  "missing",
]);

export const ArtifactIndexEntrySchema = z.object({
  schemaVersion: z.literal(ARTIFACT_PREVIEW_SCHEMA_VERSION),
  artifactId: z.string().min(1).max(256),
  taskId: z.string().min(1).max(256),
  sessionId: z.string().min(1).max(256),
  sourceKind: z.enum(["tool_observation", "workspace_file", "generated_preview"]),
  sourceId: z.string().min(1).max(256),
  sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  displayName: z.string().min(1).max(320),
  kind: ArtifactPreviewKindSchema,
  mediaType: z.string().min(1).max(240),
  relativePath: z.string().min(1).max(1024).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  createdAt: z.string().min(1).max(64),
  previewState: ArtifactPreviewStateSchema,
  metadata: JsonObjectSchema,
}).strict().superRefine((entry, context) => {
  if (entry.relativePath !== undefined && !isSafeWorkspaceRelativePath(entry.relativePath)) {
    context.addIssue({
      code: "custom",
      message: "artifact relativePath must be workspace-relative",
      path: ["relativePath"],
    });
  }
});

export const ArtifactSurfaceRefSchema = z.object({
  artifactId: z.string().min(1).max(256),
  displayName: z.string().min(1).max(320),
  kind: ArtifactPreviewKindSchema,
  previewState: ArtifactPreviewStateSchema,
}).strict();

export type ArtifactIndexEntry = z.infer<typeof ArtifactIndexEntrySchema>;
export type ArtifactSurfaceRef = z.infer<typeof ArtifactSurfaceRefSchema>;

export type ArtifactSurfaceRefs = Readonly<{
  conversationCards: readonly ArtifactSurfaceRef[];
  artifactPanel: readonly ArtifactSurfaceRef[];
  taskDetail: readonly ArtifactSurfaceRef[];
}>;

export type ArtifactTextPreviewResult =
  | Readonly<{ ok: true; value: ArtifactTextPreviewProjection }>
  | Readonly<{
    ok: false;
    reason: "not_found" | "unavailable" | "unsupported";
  }>;

export type ProjectArtifactIndexInput = Readonly<{
  task: PersistedTask;
  desktopSessionId: string;
  maxMetadataBytes?: number;
}>;

const DEFAULT_METADATA_BYTES = 4 * 1024;
const EXCEL_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function projectArtifactIndexForTask(
  input: ProjectArtifactIndexInput,
): readonly ArtifactIndexEntry[] {
  const entries: ArtifactIndexEntry[] = [];
  for (const step of input.task.checkpoint.state.runs.flatMap((run) => run.steps)) {
    if (step.observation?.outcome !== "succeeded") continue;
    const entry = isDocumentToolCapabilityId(step.action.kind)
      ? projectDocumentToolObservation({
        taskState: input.task.checkpoint.state,
        desktopSessionId: input.desktopSessionId,
        capabilityId: step.action.kind,
        actionPayload: step.action.payload,
        observation: step.observation,
        maxMetadataBytes: input.maxMetadataBytes ?? DEFAULT_METADATA_BYTES,
      })
      : step.action.kind === TEXT_FILE_WRITE_CAPABILITY_ID
        ? projectWorkspaceTextWriteObservation({
          taskState: input.task.checkpoint.state,
          desktopSessionId: input.desktopSessionId,
          observation: step.observation,
          maxMetadataBytes: input.maxMetadataBytes ?? DEFAULT_METADATA_BYTES,
        })
        : undefined;
    if (entry !== undefined) entries.push(entry);
  }
  return Object.freeze(entries.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
    || left.artifactId.localeCompare(right.artifactId)));
}

function projectWorkspaceTextWriteObservation(input: {
  taskState: TaskRunState;
  desktopSessionId: string;
  observation: Extract<Observation, { outcome: "succeeded" }>;
  maxMetadataBytes: number;
}): ArtifactIndexEntry | undefined {
  const envelope = objectRecord(input.observation.output);
  const result = objectRecord(envelope.result);
  const relativePath = typeof result.relativePath === "string"
    ? result.relativePath.normalize("NFC")
    : undefined;
  if (relativePath === undefined) return undefined;
  const pathAllowed = isSafeWorkspaceRelativePath(relativePath);
  const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse(input.observation));
  const mediaType = typeof result.mediaType === "string" && result.mediaType.length > 0
    ? boundedDisplayName(result.mediaType)
    : "text/plain";
  const mode = result.mode === "replace_existing" ? "replace_existing" : "create_new";
  const kind: ArtifactIndexEntry["kind"] = /\.html?$/iu.test(relativePath)
    ? "html"
    : /\.(?:md|markdown)$/iu.test(relativePath)
      ? "markdown"
      : "text";
  const metadata = JsonObjectSchema.parse({
    capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
    status: stringOrDefault(envelope.status, "succeeded"),
    resultDigest: stringOrDefault(objectRecord(envelope.metadata).resultDigest, "unavailable"),
    pathAllowed,
    fileSha256: stringOrDefault(result.sha256, "unavailable"),
    writeMode: mode,
    backupCreated: result.backupCreated === true,
  });
  return ArtifactIndexEntrySchema.parse({
    schemaVersion: ARTIFACT_PREVIEW_SCHEMA_VERSION,
    artifactId: artifactIdFor({
      taskId: input.taskState.taskId,
      sourceKind: "tool_observation",
      sourceId: input.observation.observationId,
      sourceDigest,
    }),
    taskId: toDesktopId("task", input.taskState.taskId),
    sessionId: input.desktopSessionId,
    sourceKind: "tool_observation",
    sourceId: input.observation.observationId,
    sourceDigest,
    displayName: boundedDisplayName(basename(relativePath)),
    kind,
    mediaType,
    ...(pathAllowed ? { relativePath } : {}),
    ...(byteSizeFor(result) === undefined ? {} : { byteSize: byteSizeFor(result) }),
    createdAt: input.observation.observedAt,
    previewState: pathAllowed ? "available" : "blocked",
    metadata: boundMetadata(metadata, input.maxMetadataBytes),
  });
}

export function projectArtifactSurfaceRefs(
  entries: readonly ArtifactIndexEntry[],
): ArtifactSurfaceRefs {
  const refs = Object.freeze(entries.map((entry) =>
    ArtifactSurfaceRefSchema.parse({
      artifactId: entry.artifactId,
      displayName: entry.displayName,
      kind: entry.kind,
      previewState: entry.previewState,
    })));
  return Object.freeze({
    conversationCards: refs,
    artifactPanel: refs,
    taskDetail: refs,
  });
}

export function projectArtifactTextPreview(input: {
  task: PersistedTask;
  desktopSessionId: string;
  artifactId: string;
  mode: ArtifactPreviewMode;
  maxBytes: number;
}): ArtifactTextPreviewResult {
  const match = findArtifactObservation(input);
  if (match === undefined) return { ok: false, reason: "not_found" };
  if (match.entry.previewState !== "available") {
    return { ok: false, reason: "unavailable" };
  }
  const text = previewContentForCapability({
    capabilityId: match.capabilityId,
    mode: input.mode,
    output: match.observation.output,
  });
  if (text === undefined) return { ok: false, reason: "unsupported" };
  const bounded = boundUtf8(text, input.maxBytes);
  return {
    ok: true,
    value: ArtifactTextPreviewProjectionSchema.parse({
      artifactId: input.artifactId,
      mode: input.mode,
      content: bounded.content,
      byteSize: bounded.byteSize,
      truncated: bounded.truncated,
      warnings: bounded.truncated ? ["preview_truncated"] : [],
    }),
  };
}

function findArtifactObservation(input: {
  task: PersistedTask;
  desktopSessionId: string;
  artifactId: string;
}): Readonly<{
  entry: ArtifactIndexEntry;
  capabilityId: DocumentToolCapabilityId;
  observation: Extract<Observation, { outcome: "succeeded" }>;
}> | undefined {
  for (const step of input.task.checkpoint.state.runs.flatMap((run) => run.steps)) {
    if (step.observation?.outcome !== "succeeded") continue;
    if (!isDocumentToolCapabilityId(step.action.kind)) continue;
    const entry = projectDocumentToolObservation({
      taskState: input.task.checkpoint.state,
      desktopSessionId: input.desktopSessionId,
      capabilityId: step.action.kind,
      actionPayload: step.action.payload,
      observation: step.observation,
      maxMetadataBytes: DEFAULT_METADATA_BYTES,
    });
    if (entry?.artifactId !== input.artifactId) continue;
    return {
      entry,
      capabilityId: step.action.kind,
      observation: step.observation,
    };
  }
  return undefined;
}

function previewContentForCapability(input: {
  capabilityId: DocumentToolCapabilityId;
  mode: ArtifactPreviewMode;
  output: unknown;
}): string | undefined {
  const envelope = objectRecord(input.output);
  const result = objectRecord(envelope.result);
  if (input.capabilityId === "tool.document.pdf.extract_text") {
    return previewPdf(result, input.mode);
  }
  if (input.capabilityId === "tool.document.pdf.extract_tables") {
    return previewPdfTables(result, input.mode);
  }
  if (input.capabilityId === "tool.document.xlsx.read") {
    return previewXlsxRead(result, input.mode);
  }
  if (input.capabilityId === "tool.document.docx.read") {
    return previewDocx(result, input.mode);
  }
  if (input.capabilityId === "tool.document.xlsx.write") {
    return previewXlsxWrite(result, input.mode);
  }
  return undefined;
}

function previewPdf(
  result: Record<string, unknown>,
  mode: ArtifactPreviewMode,
): string {
  const pages = Array.isArray(result.pages) ? result.pages : [];
  if (pages.length === 0) return "No PDF pages returned.";
  const lines = pages.map((page, index) => {
    const record = objectRecord(page);
    const pageNumber = numberOrDefault(record.pageNumber, index + 1);
    const text = stringOrEmpty(record.text);
    return mode === "markdown"
      ? [`## Page ${pageNumber}`, text].join("\n\n")
      : [`Page ${pageNumber}`, text].join("\n");
  });
  return lines.join(mode === "markdown" ? "\n\n" : "\n\n");
}

function previewPdfTables(
  result: Record<string, unknown>,
  mode: ArtifactPreviewMode,
): string {
  const tables = Array.isArray(result.tables) ? result.tables : [];
  if (tables.length === 0) return "No PDF tables returned.";
  return tables.map((table, index) => {
    const record = objectRecord(table);
    const pageNumber = numberOrDefault(record.pageNumber, 0);
    const tableIndex = numberOrDefault(record.tableIndex, index + 1);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    const renderedRows = rows.map((row) => {
      const cells = objectRecord(row).cells;
      const values = Array.isArray(cells)
        ? cells.map((cell) => stringOrEmpty(objectRecord(cell).text))
        : [];
      return mode === "markdown"
        ? `| ${values.join(" | ")} |`
        : values.join("\t");
    });
    if (mode === "markdown") {
      const firstRow = renderedRows.at(0);
      const header = firstRow === undefined
        ? []
        : [`| ${firstRow.split("|").slice(1, -1).map(() => "---").join(" | ")} |`];
      return [`## Page ${pageNumber} Table ${tableIndex}`, ...renderedRows.slice(0, 1), ...header, ...renderedRows.slice(1)]
        .join("\n");
    }
    return [`Page ${pageNumber} Table ${tableIndex}`, ...renderedRows].join("\n");
  }).join("\n\n");
}

function previewXlsxRead(
  result: Record<string, unknown>,
  mode: ArtifactPreviewMode,
): string {
  const sheets = Array.isArray(result.sheets) ? result.sheets : [];
  if (sheets.length === 0) return "No XLSX sheets returned.";
  return sheets.map((sheet, index) => {
    const record = objectRecord(sheet);
    const name = stringOrDefault(record.name, `Sheet ${index + 1}`);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    const renderedRows = rows.map((row) => {
      const rowRecord = objectRecord(row);
      const rowNumber = numberOrDefault(rowRecord.rowNumber, 0);
      const cells = Array.isArray(rowRecord.cells) ? rowRecord.cells : [];
      const values = cells.map((cell) => {
        const cellRecord = objectRecord(cell);
        const address = stringOrDefault(cellRecord.address, "");
        const value = cellRecord.value === null || cellRecord.value === undefined
          ? ""
          : String(cellRecord.value);
        return address.length === 0 ? value : `${address}=${value}`;
      });
      return mode === "markdown"
        ? `| ${rowNumber} | ${values.join(" | ")} |`
        : `row ${rowNumber}\t${values.join("\t")}`;
    });
    if (mode === "markdown") {
      return [`## ${name}`, "| Row | Cells |", "| --- | --- |", ...renderedRows]
        .join("\n");
    }
    return [`Sheet: ${name}`, ...renderedRows].join("\n");
  }).join("\n\n");
}

function previewDocx(
  result: Record<string, unknown>,
  mode: ArtifactPreviewMode,
): string {
  const blocks = Array.isArray(result.blocks) ? result.blocks : [];
  if (blocks.length === 0) return "No DOCX blocks returned.";
  return blocks.map((block, index) => {
    const record = objectRecord(block);
    const kind = stringOrDefault(record.kind, "paragraph");
    if (kind === "table") {
      const rows = Array.isArray(record.rows) ? record.rows : [];
      const rendered = rows.map((row) => {
        const cells = Array.isArray(objectRecord(row).cells)
          ? objectRecord(row).cells as readonly unknown[]
          : [];
        const values = cells.map((cell) => stringOrEmpty(objectRecord(cell).content));
        return mode === "markdown"
          ? `| ${values.join(" | ")} |`
          : values.join("\t");
      });
      if (mode === "markdown") {
        const firstRow = rendered.at(0);
        const header = firstRow === undefined
          ? []
          : [`| ${firstRow.split("|").slice(1, -1).map(() => "---").join(" | ")} |`];
        return [`### Table ${index + 1}`, ...rendered.slice(0, 1), ...header, ...rendered.slice(1)]
          .join("\n");
      }
      return [`Table ${index + 1}`, ...rendered].join("\n");
    }
    const content = stringOrEmpty(record.content);
    if (mode !== "markdown") return content;
    if (kind === "heading") return `## ${content}`;
    if (kind === "list_item") return `- ${content}`;
    return content;
  }).join(mode === "markdown" ? "\n\n" : "\n");
}

function previewXlsxWrite(
  result: Record<string, unknown>,
  mode: ArtifactPreviewMode,
): string {
  const rows = [
    ["Created", stringOrDefault(result.relativePath, "unavailable")],
    ["Bytes", String(numberOrDefault(result.byteSize, 0))],
    ["Sheets", String(numberOrDefault(result.sheetCount, 0))],
    ["Cells", String(numberOrDefault(result.cellCount, 0))],
    ["File SHA-256", stringOrDefault(result.sha256, "unavailable")],
    [
      "Logical digest",
      stringOrDefault(result.logicalWorkbookDigest, "unavailable"),
    ],
  ];
  if (mode === "markdown") {
    return [
      "## XLSX created",
      "",
      "| Field | Value |",
      "| --- | --- |",
      ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    ].join("\n");
  }
  return rows.map(([name, value]) => `${name}: ${value}`).join("\n");
}

function projectDocumentToolObservation(input: {
  taskState: TaskRunState;
  desktopSessionId: string;
  capabilityId: DocumentToolCapabilityId;
  actionPayload: JsonObject;
  observation: Extract<Observation, { outcome: "succeeded" }>;
  maxMetadataBytes: number;
}): ArtifactIndexEntry | undefined {
  const envelope = objectRecord(input.observation.output);
  const result = objectRecord(envelope.result);
  const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse(input.observation));
  const relativePath = selectRelativePath(input.capabilityId, input.actionPayload, result);
  const pathAllowed = relativePath === undefined || isSafeWorkspaceRelativePath(relativePath);
  const metadata = metadataForDocumentTool(input.capabilityId, result, envelope, pathAllowed);
  const byteSize = byteSizeFor(result);
  return ArtifactIndexEntrySchema.parse({
    schemaVersion: ARTIFACT_PREVIEW_SCHEMA_VERSION,
    artifactId: artifactIdFor({
      taskId: input.taskState.taskId,
      sourceKind: "tool_observation",
      sourceId: input.observation.observationId,
      sourceDigest,
    }),
    taskId: toDesktopId("task", input.taskState.taskId),
    sessionId: input.desktopSessionId,
    sourceKind: "tool_observation",
    sourceId: input.observation.observationId,
    sourceDigest,
    displayName: displayNameFor(input.capabilityId, pathAllowed ? relativePath : undefined),
    kind: kindForCapability(input.capabilityId),
    mediaType: mediaTypeFor(input.capabilityId, result),
    ...(pathAllowed && relativePath !== undefined ? { relativePath } : {}),
    ...(byteSize === undefined ? {} : { byteSize }),
    createdAt: input.observation.observedAt,
    previewState: pathAllowed ? "available" : "blocked",
    metadata: boundMetadata(metadata, input.maxMetadataBytes),
  });
}

function metadataForDocumentTool(
  capabilityId: DocumentToolCapabilityId,
  result: Record<string, unknown>,
  envelope: Record<string, unknown>,
  pathAllowed: boolean,
): JsonObject {
  const metadata = objectRecord(envelope.metadata);
  const base: JsonObject = {
    capabilityId,
    status: stringOrDefault(envelope.status, "succeeded"),
    resultDigest: stringOrDefault(metadata.resultDigest, "unavailable"),
    originalCount: numberOrZero(metadata.originalCount),
    returnedCount: numberOrZero(metadata.returnedCount),
    truncated: metadata.truncated === true,
    pathAllowed,
  };
  if (capabilityId === "tool.document.pdf.extract_text") {
    return JsonObjectSchema.parse({
      ...base,
      pageCount: numberOrZero(result.pageCount),
    });
  }
  if (capabilityId === "tool.document.pdf.extract_tables") {
    const tables = Array.isArray(result.tables) ? result.tables : [];
    return JsonObjectSchema.parse({
      ...base,
      pageCount: numberOrZero(result.pageCount),
      tableCount: tables.length,
      returnedCellCount: returnedPdfTableCellCount(tables),
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    });
  }
  if (capabilityId === "tool.document.xlsx.read") {
    const sheets = Array.isArray(result.sheets) ? result.sheets : [];
    return JsonObjectSchema.parse({
      ...base,
      sheetCount: sheets.length,
      returnedCellCount: returnedXlsxCellCount(sheets),
    });
  }
  if (capabilityId === "tool.document.docx.read") {
    const blocks = Array.isArray(result.blocks) ? result.blocks : [];
    return JsonObjectSchema.parse({
      ...base,
      blockCount: blocks.length,
    });
  }
  if (capabilityId === "tool.document.pptx.write") {
    return JsonObjectSchema.parse({
      ...base,
      fileSha256: stringOrDefault(result.sha256, "unavailable"),
      presentationDigest: stringOrDefault(result.presentationDigest, "unavailable"),
      slideCount: numberOrZero(result.slideCount),
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    });
  }
  return JsonObjectSchema.parse({
    ...base,
    fileSha256: stringOrDefault(result.sha256, "unavailable"),
    logicalWorkbookDigest: stringOrDefault(result.logicalWorkbookDigest, "unavailable"),
    sheetCount: numberOrZero(result.sheetCount),
    cellCount: numberOrZero(result.cellCount),
    warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
  });
}

function boundMetadata(metadata: JsonObject, maxBytes: number): JsonObject {
  const normalized = JsonObjectSchema.parse(metadata);
  const bytes = new TextEncoder().encode(JSON.stringify(normalized)).byteLength;
  if (bytes <= maxBytes) return normalized;
  return JsonObjectSchema.parse({
    truncated: true,
    originalMetadataBytes: bytes,
  });
}

function artifactIdFor(input: {
  taskId: string;
  sourceKind: "tool_observation" | "workspace_file" | "generated_preview";
  sourceId: string;
  sourceDigest: string;
}): string {
  const digest = sha256CanonicalJson(JsonValueSchema.parse(input));
  return `artifact:${digest.slice("sha256:".length)}`;
}

function displayNameFor(
  capabilityId: DocumentToolCapabilityId,
  relativePath: string | undefined,
): string {
  const suffix = relativePath === undefined ? undefined : basename(relativePath);
  const fallback = capabilityId === "tool.document.pdf.extract_text"
    ? "PDF text extraction"
    : capabilityId === "tool.document.pdf.extract_tables"
      ? "PDF table extraction"
      : capabilityId === "tool.document.xlsx.read"
        ? "XLSX workbook read"
        : capabilityId === "tool.document.docx.read"
          ? "DOCX document read"
          : capabilityId === "tool.document.xlsx.write"
            ? "XLSX workbook created"
            : "PPTX presentation created";
  return boundedDisplayName(suffix ?? fallback);
}

function kindForCapability(capabilityId: DocumentToolCapabilityId): ArtifactIndexEntry["kind"] {
  return capabilityId === "tool.document.xlsx.read" || capabilityId === "tool.document.xlsx.write"
    ? "spreadsheet"
    : "document";
}

function mediaTypeFor(
  capabilityId: DocumentToolCapabilityId,
  result: Record<string, unknown>,
): string {
  if (typeof result.mediaType === "string" && result.mediaType.trim().length > 0) {
    return boundedDisplayName(result.mediaType);
  }
  if (capabilityId === "tool.document.pdf.extract_text"
    || capabilityId === "tool.document.pdf.extract_tables") return "application/pdf";
  if (capabilityId === "tool.document.docx.read") return DOCX_MEDIA_TYPE;
  if (capabilityId === "tool.document.pptx.write") return PPTX_MEDIA_TYPE;
  return EXCEL_MEDIA_TYPE;
}

function selectRelativePath(
  capabilityId: DocumentToolCapabilityId,
  actionPayload: JsonObject,
  result: Record<string, unknown>,
): string | undefined {
  const candidate = capabilityId === "tool.document.xlsx.write" || capabilityId === "tool.document.pptx.write"
    ? result.relativePath
    : actionPayload.relativePath;
  return typeof candidate === "string" ? candidate.normalize("NFC") : undefined;
}

function byteSizeFor(result: Record<string, unknown>): number | undefined {
  return typeof result.byteSize === "number" && Number.isSafeInteger(result.byteSize) && result.byteSize >= 0
    ? result.byteSize
    : undefined;
}

function returnedXlsxCellCount(sheets: readonly unknown[]): number {
  return sheets.reduce<number>((sheetSum, sheet) => {
    const rows = objectRecord(sheet).rows;
    if (!Array.isArray(rows)) return sheetSum;
    return sheetSum + rows.reduce<number>((rowSum, row) => {
      const cells = objectRecord(row).cells;
      return rowSum + (Array.isArray(cells) ? cells.length : 0);
    }, 0);
  }, 0);
}

function returnedPdfTableCellCount(tables: readonly unknown[]): number {
  return tables.reduce<number>((tableSum, table) => {
    const rows = objectRecord(table).rows;
    if (!Array.isArray(rows)) return tableSum;
    return tableSum + rows.reduce<number>((rowSum, row) => {
      const cells = objectRecord(row).cells;
      return rowSum + (Array.isArray(cells) ? cells.length : 0);
    }, 0);
  }, 0);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC") : "";
}

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments.at(-1) ?? relativePath;
}

function boundedDisplayName(value: string): string {
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const scalars = Array.from(normalized.length === 0 ? "Artifact" : normalized);
  return scalars.slice(0, 160).join("");
}

function toDesktopId(namespace: string, internalId: string): string {
  return `${namespace}:${internalId}`;
}

function isSafeWorkspaceRelativePath(value: string): boolean {
  if (value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || value.startsWith("//")) return false;
  if (/^[a-zA-Z]:/u.test(value)) return false;
  const segments = value.split("/");
  if (segments.length === 0) return false;
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function boundUtf8(value: string, maxBytes: number): {
  content: string;
  byteSize: number;
  truncated: boolean;
} {
  const encoder = new TextEncoder();
  const normalized = value.normalize("NFC");
  const fullBytes = encoder.encode(normalized).byteLength;
  if (fullBytes <= maxBytes) {
    return {
      content: normalized,
      byteSize: fullBytes,
      truncated: false,
    };
  }
  let content = "";
  let byteSize = 0;
  for (const scalar of normalized) {
    const scalarBytes = encoder.encode(scalar).byteLength;
    if (byteSize + scalarBytes > maxBytes) break;
    content += scalar;
    byteSize += scalarBytes;
  }
  return {
    content,
    byteSize,
    truncated: true,
  };
}
