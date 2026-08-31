import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

export const DOCUMENT_CAPABILITIES = [
  "tool.document.pdf.extract_text",
  "tool.document.pdf.extract_tables",
  "tool.document.xlsx.read",
  "tool.document.docx.read",
] as const;

export type DocumentCapabilityId = (typeof DOCUMENT_CAPABILITIES)[number];

export const DOCUMENT_WORKER_PRIVATE_CAPABILITIES = [
  "tool.document.pptx.write",
  "tool.workspace.file.write_text",
] as const;

export type DocumentWorkerPrivateCapabilityId =
  (typeof DOCUMENT_WORKER_PRIVATE_CAPABILITIES)[number];

export type KnownDocumentCapabilityId =
  | DocumentCapabilityId
  | DocumentWorkerPrivateCapabilityId;

export type PdfExtractTextOptions = Readonly<{
  pageStart: number;
  pageEnd: number | null;
  maxTextBytes: number | null;
}>;

export type PdfExtractTablesOptions = Readonly<{
  pageStart: number;
  pageEnd: number | null;
  maxTables: number | null;
  maxRows: number | null;
  maxCells: number | null;
  maxTextBytes: number | null;
  includeGeometry: boolean;
  minConfidence: number | null;
}>;

export type XlsxReadOptions = Readonly<{
  maxSheets: number | null;
  maxRowsPerSheet: number | null;
  maxColumnsPerSheet: number | null;
  maxCells: number | null;
  maxCellTextBytes: number | null;
}>;

export type DocxReadOptions = Readonly<{
  maxBlocks: number | null;
  maxTextBytes: number | null;
  maxTableRows: number | null;
  maxTableCells: number | null;
}>;

export type EmptyDocumentCapabilityOptions = Readonly<Record<string, never>>;

export type StrictDocumentCapabilityOptions =
  | PdfExtractTextOptions
  | PdfExtractTablesOptions
  | XlsxReadOptions
  | DocxReadOptions
  | EmptyDocumentCapabilityOptions;

const CAPABILITY_SET = new Set<string>([
  ...DOCUMENT_CAPABILITIES,
  ...DOCUMENT_WORKER_PRIVATE_CAPABILITIES,
]);

export function isKnownDocumentCapability(
  capabilityId: string,
): capabilityId is KnownDocumentCapabilityId {
  return CAPABILITY_SET.has(capabilityId);
}

export function parseStrictDocumentCapabilityOptions(
  capabilityId: "tool.document.pdf.extract_text",
  options: Record<string, unknown>,
): PdfExtractTextOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: "tool.document.pdf.extract_tables",
  options: Record<string, unknown>,
): PdfExtractTablesOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: "tool.document.xlsx.read",
  options: Record<string, unknown>,
): XlsxReadOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: "tool.document.docx.read",
  options: Record<string, unknown>,
): DocxReadOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: KnownDocumentCapabilityId,
  options: Record<string, unknown>,
): StrictDocumentCapabilityOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: string,
  options: Record<string, unknown>,
): StrictDocumentCapabilityOptions;
export function parseStrictDocumentCapabilityOptions(
  capabilityId: string,
  options: Record<string, unknown>,
): StrictDocumentCapabilityOptions {
  if (!isKnownDocumentCapability(capabilityId)) {
    throw new DocumentCapabilityHandlerError(
      "unsupported_feature",
      `Tool ${capabilityId} is not yet implemented (DTP-1.0)`,
    );
  }

  if (capabilityId === "tool.document.pdf.extract_text") {
    return parsePdfExtractTextOptions(options);
  }
  if (capabilityId === "tool.document.pdf.extract_tables") {
    return parsePdfExtractTablesOptions(options);
  }
  if (capabilityId === "tool.document.xlsx.read") {
    return parseXlsxReadOptions(options);
  }
  if (capabilityId === "tool.document.docx.read") {
    return parseDocxReadOptions(options);
  }

  const keys = Object.keys(options);
  if (keys.length > 0) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      `Unsupported options for ${capabilityId}: ${keys.join(", ")}`,
    );
  }

  return {};
}

function parseDocxReadOptions(
  options: Record<string, unknown>,
): DocxReadOptions {
  requireOnlyKeys(options, [
    "maxBlocks",
    "maxTextBytes",
    "maxTableRows",
    "maxTableCells",
  ]);
  return {
    maxBlocks: optionalPositiveInteger(options.maxBlocks, "maxBlocks"),
    maxTextBytes: optionalPositiveInteger(options.maxTextBytes, "maxTextBytes"),
    maxTableRows: optionalPositiveInteger(options.maxTableRows, "maxTableRows"),
    maxTableCells: optionalPositiveInteger(options.maxTableCells, "maxTableCells"),
  };
}

function parseXlsxReadOptions(
  options: Record<string, unknown>,
): XlsxReadOptions {
  requireOnlyKeys(options, [
    "maxSheets",
    "maxRowsPerSheet",
    "maxColumnsPerSheet",
    "maxCells",
    "maxCellTextBytes",
  ]);
  return {
    maxSheets: optionalPositiveInteger(options.maxSheets, "maxSheets"),
    maxRowsPerSheet: optionalPositiveInteger(
      options.maxRowsPerSheet,
      "maxRowsPerSheet",
    ),
    maxColumnsPerSheet: optionalPositiveInteger(
      options.maxColumnsPerSheet,
      "maxColumnsPerSheet",
    ),
    maxCells: optionalPositiveInteger(options.maxCells, "maxCells"),
    maxCellTextBytes: optionalPositiveInteger(
      options.maxCellTextBytes,
      "maxCellTextBytes",
    ),
  };
}

function parsePdfExtractTextOptions(
  options: Record<string, unknown>,
): PdfExtractTextOptions {
  requireOnlyKeys(options, ["pageStart", "pageEnd", "maxTextBytes"]);
  const pageStart = optionalPositiveInteger(options.pageStart, "pageStart") ?? 1;
  const pageEnd = optionalPositiveInteger(options.pageEnd, "pageEnd") ?? null;
  const maxTextBytes =
    optionalPositiveInteger(options.maxTextBytes, "maxTextBytes") ?? null;
  if (pageEnd !== null && pageEnd < pageStart) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      "pageEnd must be greater than or equal to pageStart",
    );
  }
  return {
    pageStart,
    pageEnd,
    maxTextBytes,
  };
}

function parsePdfExtractTablesOptions(
  options: Record<string, unknown>,
): PdfExtractTablesOptions {
  requireOnlyKeys(options, [
    "pageStart",
    "pageEnd",
    "maxTables",
    "maxRows",
    "maxCells",
    "maxTextBytes",
    "includeGeometry",
    "minConfidence",
  ]);
  const pageStart = optionalPositiveInteger(options.pageStart, "pageStart") ?? 1;
  const pageEnd = optionalPositiveInteger(options.pageEnd, "pageEnd") ?? null;
  const minConfidence = optionalUnitNumber(options.minConfidence, "minConfidence");
  if (pageEnd !== null && pageEnd < pageStart) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      "pageEnd must be greater than or equal to pageStart",
    );
  }
  return {
    pageStart,
    pageEnd,
    maxTables: optionalPositiveInteger(options.maxTables, "maxTables"),
    maxRows: optionalPositiveInteger(options.maxRows, "maxRows"),
    maxCells: optionalPositiveInteger(options.maxCells, "maxCells"),
    maxTextBytes: optionalPositiveInteger(options.maxTextBytes, "maxTextBytes"),
    includeGeometry: optionalBoolean(options.includeGeometry, "includeGeometry") ?? false,
    minConfidence,
  };
}

function requireOnlyKeys(
  options: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      `Unsupported options: ${unknown.join(", ")}`,
    );
  }
}

function optionalPositiveInteger(value: unknown, name: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      `${name} must be a positive safe integer`,
    );
  }
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      `${name} must be a boolean`,
    );
  }
  return value;
}

function optionalUnitNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      `${name} must be a number between 0 and 1`,
    );
  }
  return value;
}
