import { constants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename as defaultRename,
  stat,
  unlink,
  link as defaultLink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve, sep, win32 } from "node:path";
import * as XLSX from "xlsx";

import { computeErrorDigest, computeResultDigest, sha256Digest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";
import { validateXlsxOoxmlPreflight } from "./ooxml-preflight.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";

export const XLSX_WRITE_CAPABILITY_ID = "tool.document.xlsx.write";

export type XlsxWriteRequest = Readonly<{
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  idempotencyKey?: string;
  requestDigest?: string;
  signal: AbortSignal;
  dependencies?: Partial<XlsxWriteDependencies>;
}>;

export type XlsxWriteOutput = Readonly<{
  format: "xlsx";
  relativePath: string;
  sha256: string;
  logicalWorkbookDigest: string;
  byteSize: number;
  sheetCount: number;
  cellCount: number;
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  warnings: readonly string[];
}>;

export type XlsxWriteDetailCode =
  | "invalid_arguments"
  | "invalid_path"
  | "parent_missing"
  | "path_outside_workspace"
  | "symlink_not_allowed"
  | "target_exists"
  | "overwrite_requires_confirmation"
  | "target_missing"
  | "target_not_regular_file"
  | "target_symlink_not_allowed"
  | "target_hardlink_not_allowed"
  | "target_digest_changed"
  | "target_not_xlsx"
  | "overwrite_cas_unsupported"
  | "duplicate_sheet"
  | "invalid_sheet_name"
  | "duplicate_row"
  | "duplicate_cell"
  | "invalid_cell"
  | "unsupported_extension"
  | "formula_not_supported"
  | "input_too_large"
  | "output_too_large"
  | "generation_failed"
  | "publish_failed"
  | "cleanup_failed";

export type XlsxWriteFaultPoint =
  | "beforeTempCreate"
  | "afterTempCreate"
  | "afterWriteBeforeFsync"
  | "afterFsyncBeforeLink"
  | "duringLink"
  | "afterLinkBeforeParentFsync"
  | "afterLockCreate"
  | "afterOverwritePreflight"
  | "afterOverwriteRehashBeforeRename"
  | "duringRename"
  | "afterRenameBeforeParentFsync"
  | "afterParentFsyncBeforeVerify"
  | "afterVerifyBeforeUnlink"
  | "afterUnlink";

export type XlsxWriteDependencies = Readonly<{
  link: typeof defaultLink;
  rename: typeof defaultRename;
  randomName: () => string;
  fault: (point: XlsxWriteFaultPoint) => void | Promise<void>;
}>;

export type NormalizedWorkbook = Readonly<{
  dateSystem: "1900" | "1904";
  sheets: readonly NormalizedSheet[];
}>;

export type NormalizedSheet = Readonly<{
  name: string;
  rows: readonly NormalizedRow[];
}>;

export type NormalizedRow = Readonly<{
  rowNumber: number;
  cells: readonly NormalizedCell[];
}>;

export type NormalizedCell = Readonly<{
  column: string;
  columnIndex: number;
  type: "boolean" | "number" | "date" | "string";
  value: boolean | number | string;
}>;

type WorkbookInput = Readonly<{
  sheets: readonly SheetInput[];
}>;

type SheetInput = Readonly<{
  name: string;
  rows: readonly RowInput[];
}>;

type RowInput = Readonly<{
  rowNumber: number;
  cells: readonly CellInput[];
}>;

type CellInput = Readonly<{
  column: string;
  type: "blank" | "boolean" | "number" | "date" | "string";
  value: string | number | boolean | null;
}>;

const MAX_SHEETS = 32;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_COLUMNS_PER_SHEET = 256;
const MAX_CELLS = 50_000;
const MAX_CELL_STRING_BYTES = 32_767;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const EXCEL_MAX_ROWS = 1_048_576;
const EXCEL_MAX_COLUMNS = 16_384;
const INVALID_SHEET_NAME_CHARS = new Set([":", "\\", "/", "?", "*", "[", "]"]);
const MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const DEFAULT_DEPENDENCIES: XlsxWriteDependencies = {
  link: defaultLink,
  rename: defaultRename,
  randomName: () => randomUUID(),
  fault: () => {},
};

export async function writeXlsx(
  request: XlsxWriteRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...request.dependencies };
  let tempPath: string | null = null;
  let lockPath: string | null = null;
  let linked = false;
  let renamed = false;
  let confirmedOldSha256: string | null = null;

  try {
    throwIfAborted(request.signal);
    const target = await resolveWriteTarget(
      request.workspaceRoot,
      request.relativePath,
    );
    const { workbook, logicalWorkbookDigest, cellCount, mode, overwrite } = normalizeWriteOptions(
      request.options,
      request.limits,
    );

    if (mode === "create_new") {
      verifyRequestDigest(
        request.idempotencyKey,
        request.requestDigest,
        request.relativePath,
        workbook,
      );
      await failIfTargetExists(target.targetPath);
    } else {
      if (overwrite === null) {
        throw writeError("internal_failure", "XLSX overwrite payload is missing", "publish_failed");
      }
      confirmedOldSha256 = overwrite.confirmedOldSha256;
      lockPath = await acquireOverwriteLock(target.parentRealPath, dependencies);
      const preflight = await preflightOverwriteTarget(target.targetPath, request.limits);
      if (preflight.oldSha256 !== confirmedOldSha256) {
        throw writeError(
          "invalid_format",
          "XLSX overwrite target digest changed before generation",
          "target_digest_changed",
        );
      }
      verifyRequestDigest(
        request.idempotencyKey,
        request.requestDigest,
        request.relativePath,
        workbook,
        confirmedOldSha256,
      );
      await dependencies.fault("afterOverwritePreflight");
    }
    throwIfAborted(request.signal);

    const bytes = generateWorkbookBytes(workbook, request.limits);
    if (bytes.byteLength > maxOutputBytes(request.limits)) {
      throw writeError(
        "limit_exceeded",
        "Generated XLSX exceeds configured output limit",
        "output_too_large",
      );
    }

    const readbackDigest = logicalDigestFromBytes(bytes, request.limits);
    if (readbackDigest !== logicalWorkbookDigest) {
      throw writeError(
        "internal_failure",
        "Generated XLSX readback did not match expected logical workbook digest",
        "generation_failed",
      );
    }

    await dependencies.fault("beforeTempCreate");
    tempPath = join(
      target.parentRealPath,
      `.robothree-dwe-${dependencies.randomName()}.tmp`,
    );
    const tempHandle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await dependencies.fault("afterTempCreate");
      throwIfAborted(request.signal);
      await tempHandle.writeFile(bytes);
      await dependencies.fault("afterWriteBeforeFsync");
      await tempHandle.sync();
    } finally {
      await tempHandle.close();
    }

    await dependencies.fault("afterFsyncBeforeLink");
    throwIfAborted(request.signal);
    if (mode === "create_new") {
      try {
        await dependencies.fault("duringLink");
        await dependencies.link(tempPath, target.targetPath);
        linked = true;
      } catch (error) {
        if (isNodeErrorCode(error, "EEXIST")) {
          throw writeError(
            "invalid_format",
            "XLSX target already exists",
            "target_exists",
          );
        }
        throw writeError(
          "internal_failure",
          "XLSX no-clobber publish is unavailable",
          "publish_failed",
        );
      }
      await dependencies.fault("afterLinkBeforeParentFsync");
    } else {
      if (lockPath === null || confirmedOldSha256 === null) {
        throw writeError("internal_failure", "XLSX overwrite state is missing", "publish_failed");
      }
      await verifyOverwriteLock(lockPath);
      const rechecked = await preflightOverwriteTarget(target.targetPath, request.limits);
      if (rechecked.oldSha256 !== confirmedOldSha256) {
        throw writeError(
          "invalid_format",
          "XLSX overwrite target digest changed before publish",
          "target_digest_changed",
        );
      }
      await dependencies.fault("afterOverwriteRehashBeforeRename");
      try {
        await dependencies.fault("duringRename");
        await dependencies.rename(tempPath, target.targetPath);
        renamed = true;
      } catch {
        throw writeError(
          "internal_failure",
          "XLSX overwrite publish failed",
          "publish_failed",
        );
      }
      await dependencies.fault("afterRenameBeforeParentFsync");
    }

    await fsyncDirectoryIfSupported(target.parentRealPath);
    await dependencies.fault("afterParentFsyncBeforeVerify");
    await verifyPublishedFile(target.targetPath, bytes, logicalWorkbookDigest, request.limits);
    await dependencies.fault("afterVerifyBeforeUnlink");
    await removeTemp(tempPath);
    tempPath = null;
    await dependencies.fault("afterUnlink");

    const output: XlsxWriteOutput = {
      format: "xlsx",
      relativePath: target.normalizedRelativePath,
      sha256: sha256Bytes(bytes),
      logicalWorkbookDigest,
      byteSize: bytes.byteLength,
      sheetCount: workbook.sheets.length,
      cellCount,
      mediaType: MEDIA_TYPE,
      warnings: [],
    };
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: workbook.sheets.length,
      returnedCount: workbook.sheets.length,
      truncated: false,
      resultDigest: computeResultDigest(output),
      timingMs: Date.now() - startedAt,
    };
    return { output, metadata };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      throw error;
    }
    if (request.signal.aborted) {
      throw new DocumentCapabilityHandlerError(
        "cancelled",
        "Processing was cancelled",
      );
    }
    throw writeError(
      "internal_failure",
      "XLSX write failed",
      linked || renamed ? "publish_failed" : "generation_failed",
    );
  } finally {
    if (tempPath !== null) {
      await removeTemp(tempPath);
    }
    if (lockPath !== null) {
      await removeTemp(lockPath);
    }
  }
}

export function normalizeXlsxWriteOptions(
  options: Record<string, unknown>,
  limits: DocumentWorkerLimits,
): {
  workbook: NormalizedWorkbook;
  logicalWorkbookDigest: string;
  cellCount: number;
} {
  return normalizeWriteOptions(options, limits);
}

export function logicalWorkbookDigest(workbook: NormalizedWorkbook): string {
  return sha256Digest(JSON.stringify(workbook, stableStringifyReplacer));
}

export function computeXlsxWriteRequestDigest(
  idempotencyKey: string,
  relativePath: string,
  workbook: NormalizedWorkbook,
): string {
  return sha256Digest(JSON.stringify({
    capabilityId: XLSX_WRITE_CAPABILITY_ID,
    idempotencyKey,
    relativePath,
    workbook,
  }, stableStringifyReplacer));
}

export function computeXlsxOverwriteRequestDigest(
  idempotencyKey: string,
  relativePath: string,
  workbook: NormalizedWorkbook,
  confirmedOldSha256: string,
): string {
  return sha256Digest(JSON.stringify({
    capabilityId: XLSX_WRITE_CAPABILITY_ID,
    confirmedOldSha256,
    idempotencyKey,
    mode: "overwrite_existing",
    relativePath,
    workbook,
  }, stableStringifyReplacer));
}

function normalizeWriteOptions(
  options: Record<string, unknown>,
  limits: DocumentWorkerLimits,
): {
  workbook: NormalizedWorkbook;
  logicalWorkbookDigest: string;
  cellCount: number;
  mode: "create_new" | "overwrite_existing";
  overwrite: { confirmedOldSha256: string } | null;
} {
  const keys = Object.keys(options);
  const allowed = new Set(["dateSystem", "mode", "overwrite", "workbook"]);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw writeError("invalid_format", "Unknown XLSX write option", "invalid_arguments");
  }
  const mode = options.mode === undefined
    ? "create_new"
    : requireEnum(options.mode, ["create_new", "overwrite_existing"], "mode");
  const overwrite = parseOverwriteOptions(mode, options.overwrite);
  const dateSystem = options.dateSystem === undefined
    ? "1900"
    : requireEnum(options.dateSystem, ["1900", "1904"], "dateSystem");
  const workbookInput = parseWorkbook(options.workbook);
  const workbook = normalizeWorkbook(workbookInput, dateSystem, limits);
  const digest = logicalWorkbookDigest(workbook);
  const cellCount = workbook.sheets.reduce(
    (total, sheet) => total + sheet.rows.reduce((rowTotal, row) => rowTotal + row.cells.length, 0),
    0,
  );
  return { workbook, logicalWorkbookDigest: digest, cellCount, mode, overwrite };
}

function parseOverwriteOptions(
  mode: "create_new" | "overwrite_existing",
  value: unknown,
): { confirmedOldSha256: string } | null {
  if (mode === "create_new") {
    if (value !== undefined) {
      throw writeError("invalid_format", "overwrite is not valid for create mode", "invalid_arguments");
    }
    return null;
  }
  if (value === undefined) {
    throw writeError(
      "unsupported_feature",
      "XLSX overwrite requires a confirmed old target digest",
      "overwrite_requires_confirmation",
    );
  }
  const object = requireRecord(value, "overwrite");
  requireOnlyKeys(object, ["confirmedOldSha256"], "overwrite");
  if (typeof object.confirmedOldSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(object.confirmedOldSha256)) {
    throw writeError("invalid_format", "confirmedOldSha256 is invalid", "invalid_arguments");
  }
  return { confirmedOldSha256: object.confirmedOldSha256 };
}

function parseWorkbook(value: unknown): WorkbookInput {
  const object = requireRecord(value, "workbook");
  requireOnlyKeys(object, ["sheets"], "workbook");
  if (!Array.isArray(object.sheets) || object.sheets.length === 0) {
    throw writeError("invalid_format", "workbook.sheets must be a non-empty array", "invalid_arguments");
  }
  return {
    sheets: object.sheets.map(parseSheet),
  };
}

function parseSheet(value: unknown): SheetInput {
  const object = requireRecord(value, "sheet");
  requireOnlyKeys(object, ["name", "rows"], "sheet");
  if (typeof object.name !== "string") {
    throw writeError("invalid_format", "sheet.name must be a string", "invalid_sheet_name");
  }
  if (!Array.isArray(object.rows)) {
    throw writeError("invalid_format", "sheet.rows must be an array", "invalid_arguments");
  }
  return {
    name: object.name,
    rows: object.rows.map(parseRow),
  };
}

function parseRow(value: unknown): RowInput {
  const object = requireRecord(value, "row");
  requireOnlyKeys(object, ["cells", "rowNumber"], "row");
  if (
    typeof object.rowNumber !== "number" ||
    !Number.isSafeInteger(object.rowNumber) ||
    object.rowNumber < 1 ||
    object.rowNumber > EXCEL_MAX_ROWS
  ) {
    throw writeError("invalid_format", "rowNumber is invalid", "invalid_cell");
  }
  if (!Array.isArray(object.cells)) {
    throw writeError("invalid_format", "row.cells must be an array", "invalid_arguments");
  }
  return {
    rowNumber: object.rowNumber,
    cells: object.cells.map(parseCell),
  };
}

function parseCell(value: unknown): CellInput {
  const object = requireRecord(value, "cell");
  requireOnlyKeys(object, ["column", "type", "value"], "cell");
  if (typeof object.column !== "string") {
    throw writeError("invalid_format", "cell.column must be a string", "invalid_cell");
  }
  const type = requireEnum(object.type, ["blank", "boolean", "date", "number", "string"], "cell.type");
  if (
    object.value !== null &&
    typeof object.value !== "string" &&
    typeof object.value !== "number" &&
    typeof object.value !== "boolean"
  ) {
    throw writeError("invalid_format", "cell.value is not JSON-safe", "invalid_cell");
  }
  return { column: object.column, type, value: object.value };
}

function normalizeWorkbook(
  input: WorkbookInput,
  dateSystem: "1900" | "1904",
  limits: DocumentWorkerLimits,
): NormalizedWorkbook {
  if (input.sheets.length > Math.min(MAX_SHEETS, limits.maxPageCount)) {
    throw writeError("limit_exceeded", "XLSX sheet count exceeds configured limit", "input_too_large");
  }
  const names = new Set<string>();
  let totalCells = 0;
  const sheets = input.sheets.map((sheet) => {
    const name = normalizeSheetName(sheet.name);
    if (names.has(name)) {
      throw writeError("invalid_format", "Duplicate XLSX sheet name", "duplicate_sheet");
    }
    names.add(name);
    const normalized = normalizeRows(sheet.rows, limits);
    totalCells += normalized.reduce((total, row) => total + row.cells.length, 0);
    if (totalCells > MAX_CELLS) {
      throw writeError("limit_exceeded", "XLSX cell count exceeds configured limit", "input_too_large");
    }
    return { name, rows: normalized };
  });
  return { dateSystem, sheets };
}

function normalizeRows(rows: readonly RowInput[], limits: DocumentWorkerLimits): readonly NormalizedRow[] {
  if (rows.length > MAX_ROWS_PER_SHEET) {
    throw writeError("limit_exceeded", "XLSX row count exceeds configured limit", "input_too_large");
  }
  const seenRows = new Set<number>();
  return [...rows].sort((left, right) => left.rowNumber - right.rowNumber).map((row) => {
    if (seenRows.has(row.rowNumber)) {
      throw writeError("invalid_format", "Duplicate XLSX row number", "duplicate_row");
    }
    seenRows.add(row.rowNumber);
    const cells = normalizeCells(row.cells, limits);
    return { rowNumber: row.rowNumber, cells };
  });
}

function normalizeCells(cells: readonly CellInput[], limits: DocumentWorkerLimits): readonly NormalizedCell[] {
  if (cells.length > MAX_COLUMNS_PER_SHEET) {
    throw writeError("limit_exceeded", "XLSX column count exceeds configured limit", "input_too_large");
  }
  const seenCells = new Set<number>();
  const normalized: NormalizedCell[] = [];
  for (const cell of cells) {
    const columnIndex = normalizeColumn(cell.column);
    if (seenCells.has(columnIndex)) {
      throw writeError("invalid_format", "Duplicate XLSX cell address", "duplicate_cell");
    }
    seenCells.add(columnIndex);
    const normalizedCell = normalizeCell(cell, columnIndex, limits);
    if (normalizedCell !== null) {
      normalized.push(normalizedCell);
    }
  }
  return normalized.sort((left, right) => left.columnIndex - right.columnIndex);
}

function normalizeCell(
  cell: CellInput,
  columnIndex: number,
  limits: DocumentWorkerLimits,
): NormalizedCell | null {
  const column = XLSX.utils.encode_col(columnIndex);
  if (cell.type === "blank") return null;
  if (cell.type === "boolean") {
    if (typeof cell.value !== "boolean") {
      throw writeError("invalid_format", "Boolean cell value is invalid", "invalid_cell");
    }
    return { column, columnIndex, type: "boolean", value: cell.value };
  }
  if (cell.type === "number") {
    if (typeof cell.value !== "number" || !Number.isFinite(cell.value)) {
      throw writeError("invalid_format", "Number cell value is invalid", "invalid_cell");
    }
    return { column, columnIndex, type: "number", value: Object.is(cell.value, -0) ? 0 : cell.value };
  }
  if (cell.type === "date") {
    if (typeof cell.value !== "string") {
      throw writeError("invalid_format", "Date cell value must be an ISO string", "invalid_cell");
    }
    const time = Date.parse(cell.value);
    if (!Number.isFinite(time)) {
      throw writeError("invalid_format", "Date cell value is invalid", "invalid_cell");
    }
    return { column, columnIndex, type: "date", value: new Date(time).toISOString() };
  }
  if (cell.type === "string") {
    if (typeof cell.value !== "string") {
      throw writeError("invalid_format", "String cell value is invalid", "invalid_cell");
    }
    const value = cell.value.normalize("NFC");
    if (Buffer.byteLength(value, "utf8") > Math.min(MAX_CELL_STRING_BYTES, limits.maxOutputBytes)) {
      throw writeError("limit_exceeded", "XLSX cell string exceeds configured limit", "input_too_large");
    }
    return { column, columnIndex, type: "string", value };
  }
  throw writeError("invalid_format", "Unsupported XLSX cell type", "invalid_cell");
}

function generateWorkbookBytes(workbook: NormalizedWorkbook, limits: DocumentWorkerLimits): Buffer {
  const book = XLSX.utils.book_new();
  book.Workbook = { WBProps: { date1904: workbook.dateSystem === "1904" } };
  for (const sheet of workbook.sheets) {
    const worksheet: XLSX.WorkSheet = {};
    let maxRow = 0;
    let maxColumn = 0;
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        const address = `${cell.column}${row.rowNumber}`;
        worksheet[address] = toSheetJsCell(cell);
        maxRow = Math.max(maxRow, row.rowNumber);
        maxColumn = Math.max(maxColumn, cell.columnIndex + 1);
      }
    }
    if (maxRow > 0 && maxColumn > 0) {
      worksheet["!ref"] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: maxRow - 1, c: maxColumn - 1 },
      });
    }
    XLSX.utils.book_append_sheet(book, worksheet, sheet.name);
  }
  try {
    const bytes = XLSX.write(book, {
      bookType: "xlsx",
      cellDates: true,
      type: "buffer",
    }) as Buffer;
    if (bytes.byteLength > maxOutputBytes(limits)) {
      throw writeError("limit_exceeded", "Generated XLSX exceeds configured output limit", "output_too_large");
    }
    validateXlsxOoxmlPreflight(bytes, "xlsx", limits);
    return Buffer.from(bytes);
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    throw writeError("internal_failure", "SheetJS failed to generate XLSX", "generation_failed");
  }
}

function toSheetJsCell(cell: NormalizedCell): XLSX.CellObject {
  switch (cell.type) {
    case "boolean":
      return { t: "b", v: cell.value };
    case "number":
      return { t: "n", v: cell.value };
    case "date":
      return { t: "d", v: new Date(cell.value as string), z: "yyyy-mm-dd hh:mm:ss.000" };
    case "string":
      return { t: "s", v: cell.value };
  }
}

function logicalDigestFromBytes(bytes: Buffer, limits: DocumentWorkerLimits): string {
  validateXlsxOoxmlPreflight(bytes, "xlsx", limits);
  const workbook = XLSX.read(bytes, {
    type: "buffer",
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    raw: true,
    WTF: true,
  });
  const dateSystem = workbook.Workbook?.WBProps?.date1904 === true ? "1904" : "1900";
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet === undefined) {
      throw writeError("internal_failure", "Generated workbook references a missing sheet", "generation_failed");
    }
    return {
      name: normalizeSheetName(sheetName),
      rows: worksheetRowsForDigest(worksheet, dateSystem, limits),
    };
  });
  return logicalWorkbookDigest({ dateSystem, sheets });
}

function worksheetRowsForDigest(
  worksheet: XLSX.WorkSheet,
  _dateSystem: "1900" | "1904",
  limits: DocumentWorkerLimits,
): readonly NormalizedRow[] {
  const rowMap = new Map<number, NormalizedCell[]>();
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith("!")) continue;
    const rawCell = worksheet[address] as XLSX.CellObject | undefined;
    if (rawCell === undefined) continue;
    if (rawCell.f !== undefined) {
      throw writeError("unsupported_feature", "Generated XLSX contains a formula", "formula_not_supported");
    }
    if ((rawCell as { l?: unknown }).l !== undefined) {
      throw writeError("unsupported_feature", "Generated XLSX contains a hyperlink", "formula_not_supported");
    }
    const decoded = XLSX.utils.decode_cell(address);
    const cell = normalizeReadbackCell(rawCell, decoded.c, limits);
    if (cell === null) continue;
    const rowNumber = decoded.r + 1;
    const cells = rowMap.get(rowNumber) ?? [];
    cells.push(cell);
    rowMap.set(rowNumber, cells);
  }
  return Array.from(rowMap.entries()).sort(([left], [right]) => left - right).map(([rowNumber, cells]) => ({
    rowNumber,
    cells: cells.sort((left, right) => left.columnIndex - right.columnIndex),
  }));
}

function normalizeReadbackCell(
  cell: XLSX.CellObject,
  columnIndex: number,
  limits: DocumentWorkerLimits,
): NormalizedCell | null {
  const column = XLSX.utils.encode_col(columnIndex);
  if (cell.t === "z") return null;
  if (cell.t === "b") return { column, columnIndex, type: "boolean", value: Boolean(cell.v) };
  if (cell.t === "n") {
    if (typeof cell.v !== "number" || !Number.isFinite(cell.v)) {
      throw writeError("internal_failure", "Generated XLSX number readback is invalid", "generation_failed");
    }
    return { column, columnIndex, type: "number", value: Object.is(cell.v, -0) ? 0 : cell.v };
  }
  if (cell.t === "d") {
    const value = cell.v instanceof Date ? cell.v : new Date(String(cell.v));
    const time = value.getTime();
    if (!Number.isFinite(time)) {
      throw writeError("internal_failure", "Generated XLSX date readback is invalid", "generation_failed");
    }
    return { column, columnIndex, type: "date", value: new Date(time).toISOString() };
  }
  const cellType = cell.t as string;
  if (cellType === "s" || cellType === "str") {
    const value = String(cell.v ?? "").normalize("NFC");
    if (Buffer.byteLength(value, "utf8") > Math.min(MAX_CELL_STRING_BYTES, limits.maxOutputBytes)) {
      throw writeError("limit_exceeded", "Generated XLSX string readback exceeds limit", "output_too_large");
    }
    return { column, columnIndex, type: "string", value };
  }
  throw writeError("internal_failure", "Generated XLSX cell readback is unsupported", "generation_failed");
}

async function verifyPublishedFile(
  targetPath: string,
  expectedBytes: Buffer,
  expectedLogicalDigest: string,
  limits: DocumentWorkerLimits,
): Promise<void> {
  const bytes = await readFileBounded(targetPath, maxOutputBytes(limits), "output_too_large");
  if (sha256Bytes(bytes) !== sha256Bytes(expectedBytes)) {
    throw writeError("internal_failure", "Published XLSX binary digest mismatch", "publish_failed");
  }
  if (logicalDigestFromBytes(bytes, limits) !== expectedLogicalDigest) {
    throw writeError("internal_failure", "Published XLSX logical digest mismatch", "publish_failed");
  }
}

async function acquireOverwriteLock(
  parentRealPath: string,
  dependencies: XlsxWriteDependencies,
): Promise<string> {
  const lockPath = join(parentRealPath, `.robothree-dwo-${dependencies.randomName()}.lock`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await dependencies.fault("afterLockCreate");
    await handle.sync();
    return lockPath;
  } catch (error) {
    await unlink(lockPath).catch(() => {});
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    throw writeError(
      "internal_failure",
      "XLSX overwrite lock is unavailable",
      "overwrite_cas_unsupported",
    );
  } finally {
    await handle?.close();
  }
}

async function verifyOverwriteLock(lockPath: string): Promise<void> {
  try {
    const lockStat = await lstat(lockPath);
    if (!lockStat.isFile()) {
      throw writeError("internal_failure", "XLSX overwrite lock is invalid", "overwrite_cas_unsupported");
    }
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    throw writeError("internal_failure", "XLSX overwrite lock disappeared", "overwrite_cas_unsupported");
  }
}

async function preflightOverwriteTarget(
  targetPath: string,
  limits: DocumentWorkerLimits,
): Promise<{ oldSha256: string; byteSize: number }> {
  let targetLstat: Awaited<ReturnType<typeof lstat>>;
  try {
    targetLstat = await lstat(targetPath);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw writeError("invalid_format", "XLSX overwrite target is missing", "target_missing");
    }
    throw writeError("internal_failure", "Unable to inspect XLSX overwrite target", "publish_failed");
  }
  if (targetLstat.isSymbolicLink()) {
    throw writeError("invalid_format", "XLSX overwrite target is a symlink", "target_symlink_not_allowed");
  }
  if (!targetLstat.isFile()) {
    throw writeError("invalid_format", "XLSX overwrite target is not a regular file", "target_not_regular_file");
  }
  if (targetLstat.nlink !== 1) {
    throw writeError("invalid_format", "XLSX overwrite target has hardlinks", "target_hardlink_not_allowed");
  }

  const targetRealPath = await realpath(targetPath).catch(() => {
    throw writeError("invalid_format", "XLSX overwrite target is unavailable", "target_missing");
  });
  if (targetRealPath !== targetPath) {
    throw writeError("invalid_format", "XLSX overwrite target identity changed", "target_digest_changed");
  }

  const targetStat = await stat(targetPath).catch(() => {
    throw writeError("invalid_format", "XLSX overwrite target is unavailable", "target_missing");
  });
  if (
    targetStat.dev !== targetLstat.dev ||
    targetStat.ino !== targetLstat.ino ||
    targetStat.size !== targetLstat.size
  ) {
    throw writeError("invalid_format", "XLSX overwrite target identity changed", "target_digest_changed");
  }

  const bytes = await readFileBounded(targetPath, limits.maxFileBytes, "input_too_large");
  try {
    validateXlsxOoxmlPreflight(bytes, "xlsx", limits);
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError && error.code === "invalid_format") {
      throw writeError("unsupported_feature", "XLSX overwrite target is not an XLSX file", "target_not_xlsx");
    }
    throw error;
  }
  return {
    oldSha256: sha256Bytes(bytes),
    byteSize: bytes.byteLength,
  };
}

async function readFileBounded(
  path: string,
  maxBytes: number,
  detailCode: Extract<XlsxWriteDetailCode, "input_too_large" | "output_too_large">,
): Promise<Buffer> {
  const fileStat = await stat(path).catch(() => {
    throw writeError("invalid_format", "XLSX file is unavailable", "target_missing");
  });
  if (fileStat.size > maxBytes) {
    throw writeError("limit_exceeded", "XLSX file exceeds configured byte limit", detailCode);
  }
  return Buffer.from(await readFile(path));
}

async function resolveWriteTarget(
  workspaceRoot: string,
  relativePath: string,
): Promise<{
  rootRealPath: string;
  parentRealPath: string;
  targetPath: string;
  normalizedRelativePath: string;
}> {
  validateRelativePath(relativePath);
  if (!relativePath.toLowerCase().endsWith(".xlsx")) {
    throw writeError("unsupported_feature", "Only .xlsx output is supported", "unsupported_extension");
  }

  const rootRealPath = await realpath(workspaceRoot).catch(() => {
    throw writeError("invalid_format", "Workspace is unavailable", "path_outside_workspace");
  });
  const parentLexical = resolve(rootRealPath, dirname(relativePath));
  if (!isContained(rootRealPath, parentLexical)) {
    throw writeError("invalid_format", "XLSX target escapes workspace", "path_outside_workspace");
  }
  const parentRealPath = await realpath(parentLexical).catch(() => {
    throw writeError("invalid_format", "XLSX target parent does not exist", "parent_missing");
  });
  if (!isContained(rootRealPath, parentRealPath)) {
    throw writeError("invalid_format", "XLSX target parent escapes workspace", "path_outside_workspace");
  }
  const parentStat = await stat(parentRealPath).catch(() => {
    throw writeError("invalid_format", "XLSX target parent does not exist", "parent_missing");
  });
  if (!parentStat.isDirectory()) {
    throw writeError("invalid_format", "XLSX target parent is not a directory", "parent_missing");
  }
  const targetPath = join(parentRealPath, basename(relativePath));
  if (!isContained(rootRealPath, targetPath)) {
    throw writeError("invalid_format", "XLSX target escapes workspace", "path_outside_workspace");
  }
  return {
    rootRealPath,
    parentRealPath,
    targetPath,
    normalizedRelativePath: relativePath,
  };
}

function validateRelativePath(relativePath: string): void {
  if (relativePath.length === 0 || relativePath.length > 1024) {
    throw writeError("invalid_format", "Invalid XLSX target path", "invalid_path");
  }
  if (
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith("\\\\") ||
    relativePath.includes("://")
  ) {
    throw writeError("invalid_format", "Invalid XLSX target path", "invalid_path");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw writeError("invalid_format", "Invalid XLSX target path", "invalid_path");
  }
}

async function failIfTargetExists(targetPath: string): Promise<void> {
  try {
    const existing = await lstat(targetPath);
    if (existing.isSymbolicLink()) {
      throw writeError("invalid_format", "XLSX target is a symlink", "symlink_not_allowed");
    }
    throw writeError("invalid_format", "XLSX target already exists", "target_exists");
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw writeError("internal_failure", "Unable to inspect XLSX target", "publish_failed");
  }
}

async function fsyncDirectoryIfSupported(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // Directory fsync is not consistently supported across platforms.
  } finally {
    await handle?.close();
  }
}

async function removeTemp(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) {
      throw writeError("internal_failure", "Unable to clean XLSX temp file", "cleanup_failed");
    }
  }
}

function normalizeSheetName(name: string): string {
  const normalized = name.normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized.length > 31 ||
    hasInvalidSheetNameChar(normalized) ||
    normalized.startsWith("'") ||
    normalized.endsWith("'")
  ) {
    throw writeError("invalid_format", "Invalid XLSX sheet name", "invalid_sheet_name");
  }
  return normalized;
}

function hasInvalidSheetNameChar(name: string): boolean {
  for (const char of name) {
    if (INVALID_SHEET_NAME_CHARS.has(char) || char.charCodeAt(0) < 0x20) {
      return true;
    }
  }
  return false;
}

function normalizeColumn(column: string): number {
  if (!/^[A-Z]{1,3}$/u.test(column)) {
    throw writeError("invalid_format", "Invalid XLSX column", "invalid_cell");
  }
  const index = XLSX.utils.decode_col(column);
  if (index < 0 || index >= EXCEL_MAX_COLUMNS || index >= MAX_COLUMNS_PER_SHEET) {
    throw writeError("limit_exceeded", "XLSX column exceeds configured limit", "input_too_large");
  }
  return index;
}

function verifyRequestDigest(
  idempotencyKey: string | undefined,
  requestDigest: string | undefined,
  relativePath: string,
  workbook: NormalizedWorkbook,
  confirmedOldSha256?: string,
): void {
  if (
    idempotencyKey === undefined ||
    idempotencyKey.length === 0 ||
    idempotencyKey.length > 240
  ) {
    throw writeError("invalid_format", "XLSX write idempotencyKey is required", "invalid_arguments");
  }
  if (requestDigest === undefined || !/^[a-f0-9]{64}$/u.test(requestDigest)) {
    throw writeError("invalid_format", "XLSX write requestDigest is required", "invalid_arguments");
  }
  const expected = confirmedOldSha256 === undefined
    ? computeXlsxWriteRequestDigest(idempotencyKey, relativePath, workbook)
    : computeXlsxOverwriteRequestDigest(
      idempotencyKey,
      relativePath,
      workbook,
      confirmedOldSha256,
    );
  if (requestDigest !== expected) {
    throw writeError("invalid_format", "XLSX request digest mismatch", "invalid_arguments");
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw writeError("invalid_format", `${name} must be an object`, "invalid_arguments");
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
  name: string,
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(object).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw writeError("invalid_format", `${name} contains unknown fields`, "invalid_arguments");
  }
}

function requireEnum<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw writeError("invalid_format", `${name} is invalid`, "invalid_arguments");
  }
  return value as T;
}

function maxOutputBytes(limits: DocumentWorkerLimits): number {
  return Math.min(limits.maxOutputBytes, MAX_OUTPUT_BYTES);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DocumentCapabilityHandlerError("cancelled", "Processing was cancelled");
  }
}

function writeError(
  code: "invalid_format" | "limit_exceeded" | "unsupported_feature" | "internal_failure",
  message: string,
  detailCode: XlsxWriteDetailCode,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, detailCode),
    detailCode,
  );
}

function isContained(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableStringifyReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
