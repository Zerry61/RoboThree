import {
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type Observation,
  type ProviderNeutralMessage,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { WORKSPACE_TEXT_READ_CAPABILITY_ID } from "./context-material-policy.js";
import {
  DOCUMENT_TOOL_CAPABILITY_IDS,
  DOCUMENT_TOOL_REGISTRY_RECORDS,
  type DocumentToolCapabilityId,
} from "../registry/document-tool-registry.js";
import type { ToolSchemaCandidate } from "./context-types.js";

export type DocumentToolContextCandidateInput = Readonly<{
  snapshotId: string;
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
  locks: readonly TaskCapabilityLock[];
  authorization: Readonly<{
    outcome: "allowed" | "denied";
    decisionDigest: string;
  }>;
}>;

const DOCUMENT_TOOL_CAPABILITY_SET = new Set<string>(DOCUMENT_TOOL_CAPABILITY_IDS);
const DEFAULT_DOCUMENT_TOOL_PREVIEW_BYTES = 4_096;

export function isDocumentToolCapabilityId(value: string): value is DocumentToolCapabilityId {
  return DOCUMENT_TOOL_CAPABILITY_SET.has(value);
}

export function documentToolCandidatesForContext(
  input: DocumentToolContextCandidateInput,
): readonly ToolSchemaCandidate[] {
  if (input.authorization.outcome !== "allowed") return [];
  const locksById = new Map(input.locks.map((lock) => [lock.lockId, lock]));
  const definitionsById = new Map(DOCUMENT_TOOL_REGISTRY_RECORDS.definitions.map((definition) => [
    definition.capabilityId,
    definition,
  ]));
  const bindingsByCapabilityId = new Map(DOCUMENT_TOOL_REGISTRY_RECORDS.bindings.map((binding) => [
    binding.capability.capabilityId,
    binding,
  ]));
  const candidates: ToolSchemaCandidate[] = [];
  for (const reference of input.runtimeSelection.toolLocks) {
    if (!isDocumentToolCapabilityId(reference.capabilityId)) continue;
    const lock = locksById.get(reference.lockId);
    const definition = definitionsById.get(reference.capabilityId);
    const binding = bindingsByCapabilityId.get(reference.capabilityId);
    if (
      lock === undefined
      || definition === undefined
      || binding === undefined
      || lock.taskId !== input.runtimeSelection.taskId
      || lock.registryRevision !== input.runtimeSelection.registryRevision
      || lock.definitionSnapshot.capabilityId !== reference.capabilityId
      || lock.definitionSnapshot.revision !== definition.revision
      || lock.bindingSnapshot.revision !== binding.revision
      || lock.adapterDescriptorSnapshot.revision !== DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.revision
    ) continue;
    const lockDigest = sha256CanonicalJson(JsonValueSchema.parse(lock));
    if (lockDigest !== reference.lockDigest) continue;
    candidates.push({
      snapshotId: input.snapshotId,
      selected: true,
      authorization: input.authorization,
      lockDigest,
      lock,
      registration: {
        registryRevision: lock.registryRevision,
        capabilityRevision: definition.revision,
        bindingRevision: binding.revision,
        adapterDescriptorRevision: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.revision,
        versionCompatible: true,
      },
    });
  }
  return Object.freeze(candidates.sort((left, right) =>
    left.lock.definitionSnapshot.capabilityId.localeCompare(
      right.lock.definitionSnapshot.capabilityId,
    )));
}

export function toolObservationMessage(
  call: AssistantToolCall,
  observation: Observation,
): Extract<ProviderNeutralMessage, { role: "tool" }> {
  const content = observation.outcome === "succeeded"
    ? observationSuccessParts(call.capabilityId, observation)
    : textParts(observation.error.message);
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: call.toolCallId,
    taskId: call.taskId,
    actionId: call.actionId,
    observationId: observation.observationId,
    outcome: observation.outcome,
    resultDigest: sha256CanonicalJson(JsonValueSchema.parse(observation)),
    content,
  };
}

function observationSuccessParts(
  capabilityId: string,
  observation: Extract<Observation, { outcome: "succeeded" }>,
): Array<{ type: "text"; text: string }> {
  const content = observationSuccessContent(capabilityId, observation);
  return capabilityId === WORKSPACE_TEXT_READ_CAPABILITY_ID
    ? textParts(content, 64 * 1024)
    : textParts(content);
}

function textParts(
  content: string,
  maximumPartCharacters = 262_144,
): Array<{ type: "text"; text: string }> {
  if (content.length === 0) return [];
  const parts: Array<{ type: "text"; text: string }> = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(start + maximumPartCharacters, content.length);
    if (
      end < content.length
      && end > start
      && /[\uD800-\uDBFF]/u.test(content[end - 1]!)
    ) end -= 1;
    parts.push({ type: "text", text: content.slice(start, end) });
    start = end;
  }
  return parts;
}

function observationSuccessContent(
  capabilityId: string,
  observation: Extract<Observation, { outcome: "succeeded" }>,
): string {
  if (!isDocumentToolCapabilityId(capabilityId)) {
    return JSON.stringify(observation.output ?? null);
  }
  return formatDocumentToolPreview(capabilityId, observation.output);
}

function formatDocumentToolPreview(
  capabilityId: DocumentToolCapabilityId,
  output: unknown,
): string {
  const envelope = objectRecord(output);
  const metadata = objectRecord(envelope.metadata);
  const result = objectRecord(envelope.result);
  const header = [
    `Document tool: ${capabilityId}`,
    `Status: ${typeof envelope.status === "string" ? envelope.status : "succeeded"}`,
    `Original count: ${numberOrUnknown(metadata.originalCount)}`,
    `Returned count: ${numberOrUnknown(metadata.returnedCount)}`,
    `Truncated: ${metadata.truncated === true ? "true" : "false"}`,
    `Result digest: ${typeof metadata.resultDigest === "string" ? metadata.resultDigest : "unavailable"}`,
  ];
  const body = capabilityId === "tool.document.pdf.extract_text"
    ? pdfPreview(result)
    : capabilityId === "tool.document.pdf.extract_tables"
      ? pdfTablePreview(result)
      : capabilityId === "tool.document.xlsx.read"
      ? xlsxPreview(result)
      : capabilityId === "tool.document.docx.read"
        ? docxPreview(result)
        : capabilityId === "tool.document.xlsx.write"
          ? xlsxWritePreview(result)
          : pptxWritePreview(result);
  return truncateUtf8([...header, "", body].join("\n"), DEFAULT_DOCUMENT_TOOL_PREVIEW_BYTES);
}

function pdfPreview(result: Record<string, unknown>): string {
  const pages = Array.isArray(result.pages) ? result.pages : [];
  if (pages.length === 0) return "No PDF pages returned.";
  return pages.slice(0, 5).map((page, index) => {
    const record = objectRecord(page);
    const pageNumber = typeof record.pageNumber === "number" ? record.pageNumber : index + 1;
    return `[page ${pageNumber}] ${singleLine(record.text)}`;
  }).join("\n");
}

function pdfTablePreview(result: Record<string, unknown>): string {
  const tables = Array.isArray(result.tables) ? result.tables : [];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.slice(0, 8).map((warning) => `Warning: ${singleLine(warning)}`)
    : [];
  if (tables.length === 0) {
    return ["No PDF tables returned.", ...warnings].join("\n");
  }
  const tableLines = tables.slice(0, 5).flatMap((table, index) => {
    const record = objectRecord(table);
    const pageNumber = numberOrUnknown(record.pageNumber);
    const tableIndex = numberOrUnknown(record.tableIndex);
    const rowCount = numberOrUnknown(record.rowCount);
    const columnCount = numberOrUnknown(record.columnCount);
    const confidence = numberOrUnknown(record.confidence);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    const previewRows = rows.slice(0, 3).map((row) => {
      const cells = objectRecord(row).cells;
      const values = Array.isArray(cells)
        ? cells.slice(0, 6).map((cell) => singleLine(objectRecord(cell).text))
        : [];
      return `  ${values.join(" | ")}`;
    });
    return [
      `[table ${index + 1}] page ${pageNumber}, table ${tableIndex}: ${rowCount} rows x ${columnCount} columns, confidence ${confidence}`,
      ...previewRows,
    ];
  });
  return [...tableLines, ...warnings].join("\n");
}

function xlsxPreview(result: Record<string, unknown>): string {
  const sheets = Array.isArray(result.sheets) ? result.sheets : [];
  if (sheets.length === 0) return "No XLSX sheets returned.";
  return sheets.slice(0, 5).map((sheet, index) => {
    const record = objectRecord(sheet);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    const cellCount = rows.reduce((sum, row) => {
      const cells = objectRecord(row).cells;
      return sum + (Array.isArray(cells) ? cells.length : 0);
    }, 0);
    const name = singleLine(record.name || `Sheet ${index + 1}`);
    const visibility = typeof record.visibility === "string" ? record.visibility : "unknown";
    return `- ${name} (${visibility}): ${cellCount} returned cells`;
  }).join("\n");
}

function xlsxWritePreview(result: Record<string, unknown>): string {
  const lines = [
    `Created: ${singleLine(result.relativePath)}`,
    `Bytes: ${numberOrUnknown(result.byteSize)}`,
    `Sheets: ${numberOrUnknown(result.sheetCount)}`,
    `Cells: ${numberOrUnknown(result.cellCount)}`,
    `File SHA-256: ${typeof result.sha256 === "string" ? result.sha256 : "unavailable"}`,
    `Logical workbook digest: ${typeof result.logicalWorkbookDigest === "string" ? result.logicalWorkbookDigest : "unavailable"}`,
  ];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.slice(0, 8).map((warning) => `Warning: ${singleLine(warning)}`)
    : [];
  return [...lines, ...warnings].join("\n");
}

function pptxWritePreview(result: Record<string, unknown>): string {
  const lines = [
    `Created: ${singleLine(result.relativePath)}`,
    `Bytes: ${numberOrUnknown(result.byteSize)}`,
    `Slides: ${numberOrUnknown(result.slideCount)}`,
    `File SHA-256: ${typeof result.sha256 === "string" ? result.sha256 : "unavailable"}`,
    `Presentation digest: ${typeof result.presentationDigest === "string" ? result.presentationDigest : "unavailable"}`,
  ];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.slice(0, 8).map((warning) => `Warning: ${singleLine(warning)}`)
    : [];
  return [...lines, ...warnings].join("\n");
}

function docxPreview(result: Record<string, unknown>): string {
  const blocks = Array.isArray(result.blocks) ? result.blocks : [];
  if (blocks.length === 0) return "No DOCX blocks returned.";
  return blocks.slice(0, 8).map((block, index) => {
    const record = objectRecord(block);
    const kind = typeof record.kind === "string" ? record.kind : "block";
    if (kind === "table") {
      const rows = Array.isArray(record.rows) ? record.rows : [];
      return `[block ${index + 1}] table with ${rows.length} returned rows`;
    }
    return `[block ${index + 1}] ${kind}: ${singleLine(record.content)}`;
  }).join("\n");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrUnknown(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "unknown";
}

function singleLine(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}...` : collapsed;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encoder.encode(value.slice(0, mid)).byteLength <= maxBytes - 3) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${value.slice(0, low)}...`;
}
