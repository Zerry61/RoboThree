import * as XLSX from "xlsx";

import { computeErrorDigest, computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";
import { validateXlsxOoxmlPreflight } from "./ooxml-preflight.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";
import type { XlsxReadOptions } from "../handlers/index.js";

type XlsxReadRequest = Readonly<{
  bytes: Uint8Array;
  extension: string;
  limits: DocumentWorkerLimits;
  options: XlsxReadOptions;
}>;

type XlsxOutput = Readonly<{
  format: "xlsx";
  dateSystem: "1900" | "1904";
  sheets: readonly XlsxSheetOutput[];
}>;

type XlsxSheetOutput = Readonly<{
  index: number;
  name: string;
  visibility: "visible" | "hidden" | "veryHidden";
  usedRange: XlsxUsedRange | null;
  rows: readonly XlsxRowOutput[];
}>;

type XlsxUsedRange = Readonly<{
  start: string;
  end: string;
  rowCount: number;
  columnCount: number;
}>;

type XlsxRowOutput = Readonly<{
  rowNumber: number;
  cells: readonly XlsxCellOutput[];
}>;

type XlsxCellOutput = Readonly<{
  address: string;
  column: string;
  type: "blank" | "boolean" | "number" | "date" | "string" | "error";
  value: string | number | boolean | null;
  formula?: string;
}>;

type WorksheetCell = Readonly<{
  t?: unknown;
  v?: unknown;
  f?: unknown;
  z?: unknown;
  w?: unknown;
}>;

const DEFAULT_MAX_ROWS_PER_SHEET = 10_000;
const DEFAULT_MAX_COLUMNS_PER_SHEET = 256;
const DEFAULT_MAX_CELLS = 50_000;
const DEFAULT_MAX_CELL_TEXT_BYTES = 32_768;
const EXCEL_DAY_MS = 86_400_000;

export async function readXlsx(
  request: XlsxReadRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  const preflight = validateXlsxOoxmlPreflight(
    request.bytes,
    request.extension,
    request.limits,
  );
  try {
    const workbook = XLSX.read(request.bytes, {
      type: "array",
      cellDates: false,
      cellFormula: true,
      cellHTML: false,
      cellNF: true,
      cellStyles: false,
      dense: false,
      raw: true,
      WTF: true,
    });
    const dateSystem = workbook.Workbook?.WBProps?.date1904 === true ? "1904" : "1900";
    const output = buildOutput(workbook, dateSystem, request);
    const outputBytes = Buffer.byteLength(JSON.stringify(output), "utf8");
    if (outputBytes > request.limits.maxOutputBytes) {
      throw typedError("limit_exceeded", "XLSX output exceeds configured limit", "xlsx_output");
    }
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: workbook.SheetNames.length,
      returnedCount: output.sheets.length,
      truncated: false,
      resultDigest: computeResultDigest(output),
      locators: output.sheets.flatMap((sheet) =>
        sheet.rows.flatMap((row) =>
          row.cells.map((cell) => ({
            sheetIndex: sheet.index,
            sheetName: sheet.name,
            cell: cell.address,
          })),
        ),
      ),
      timingMs: Date.now() - startedAt,
    };
    void preflight;
    return { output, metadata };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      throw error;
    }
    throw mapXlsxError(error);
  }
}

function buildOutput(
  workbook: XLSX.WorkBook,
  dateSystem: "1900" | "1904",
  request: XlsxReadRequest,
): XlsxOutput {
  const maxSheets = Math.min(
    request.options.maxSheets ?? request.limits.maxPageCount,
    request.limits.maxPageCount,
  );
  if (workbook.SheetNames.length > maxSheets) {
    throw typedError("limit_exceeded", "XLSX sheet count exceeds configured limit", "xlsx_sheet_count");
  }

  const sheets: XlsxSheetOutput[] = [];
  let totalCells = 0;
  const maxCells = request.options.maxCells ?? DEFAULT_MAX_CELLS;
  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const name = workbook.SheetNames[sheetIndex]!;
    const worksheet = workbook.Sheets[name];
    if (worksheet === undefined) {
      throw typedError("corrupt", "XLSX workbook references a missing sheet", "xlsx_missing_sheet");
    }
    const { rows, usedRange, cellCount } = sheetRows(
      worksheet,
      dateSystem,
      request,
    );
    totalCells += cellCount;
    if (totalCells > maxCells) {
      throw typedError("limit_exceeded", "XLSX cell count exceeds configured limit", "xlsx_cell_count");
    }
    sheets.push({
      index: sheetIndex,
      name: sanitizeString(name, 128, "xlsx_sheet_name"),
      visibility: sheetVisibility(workbook, sheetIndex),
      usedRange,
      rows,
    });
  }
  return {
    format: "xlsx",
    dateSystem,
    sheets,
  };
}

function sheetRows(
  worksheet: XLSX.WorkSheet,
  dateSystem: "1900" | "1904",
  request: XlsxReadRequest,
): { rows: XlsxRowOutput[]; usedRange: XlsxUsedRange | null; cellCount: number } {
  const ref = typeof worksheet["!ref"] === "string" ? worksheet["!ref"] : null;
  if (ref === null) {
    return { rows: [], usedRange: null, cellCount: 0 };
  }
  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  const maxRows = request.options.maxRowsPerSheet ?? DEFAULT_MAX_ROWS_PER_SHEET;
  const maxColumns =
    request.options.maxColumnsPerSheet ?? DEFAULT_MAX_COLUMNS_PER_SHEET;
  if (rowCount > maxRows || columnCount > maxColumns) {
    throw typedError("limit_exceeded", "XLSX used range exceeds configured dimensions", "xlsx_used_range");
  }

  const rowMap = new Map<number, XlsxCellOutput[]>();
  let cellCount = 0;
  for (const address of Object.keys(worksheet).sort(compareCellAddresses)) {
    if (address.startsWith("!")) {
      continue;
    }
    const decoded = XLSX.utils.decode_cell(address);
    if (
      decoded.r < range.s.r ||
      decoded.r > range.e.r ||
      decoded.c < range.s.c ||
      decoded.c > range.e.c
    ) {
      continue;
    }
    const cell = worksheet[address] as WorksheetCell | undefined;
    if (cell === undefined) {
      continue;
    }
    const rowNumber = decoded.r + 1;
    const cells = rowMap.get(rowNumber) ?? [];
    cells.push(formatCell(address, decoded.c, cell, dateSystem, request));
    rowMap.set(rowNumber, cells);
    cellCount += 1;
  }

  const rows = Array.from(rowMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, cells]) => ({
      rowNumber,
      cells: cells.sort((left, right) =>
        XLSX.utils.decode_cell(left.address).c -
        XLSX.utils.decode_cell(right.address).c
      ),
    }));

  return {
    rows,
    usedRange: {
      start: XLSX.utils.encode_cell(range.s),
      end: XLSX.utils.encode_cell(range.e),
      rowCount,
      columnCount,
    },
    cellCount,
  };
}

function formatCell(
  address: string,
  columnIndex: number,
  cell: WorksheetCell,
  dateSystem: "1900" | "1904",
  request: XlsxReadRequest,
): XlsxCellOutput {
  const formula = typeof cell.f === "string"
    ? sanitizeString(cell.f, request.limits.maxOutputBytes, "xlsx_formula")
    : undefined;
  const base = {
    address,
    column: XLSX.utils.encode_col(columnIndex),
    ...(formula === undefined ? {} : { formula }),
  };
  if (cell.t === "b") {
    return { ...base, type: "boolean", value: Boolean(cell.v) };
  }
  if (cell.t === "n" && typeof cell.v === "number") {
    if (isDateCell(cell)) {
      return {
        ...base,
        type: "date",
        value: excelSerialToIso(cell.v, dateSystem),
      };
    }
    return { ...base, type: "number", value: cell.v };
  }
  if (cell.t === "e") {
    return {
      ...base,
      type: "error",
      value: typeof cell.w === "string" ? cell.w : String(cell.v ?? ""),
    };
  }
  if (cell.v === undefined || cell.v === null) {
    return { ...base, type: "blank", value: null };
  }
  return {
    ...base,
    type: "string",
    value: sanitizeString(
      String(cell.v),
      request.options.maxCellTextBytes ?? DEFAULT_MAX_CELL_TEXT_BYTES,
      "xlsx_cell_text",
    ),
  };
}

function sheetVisibility(
  workbook: XLSX.WorkBook,
  sheetIndex: number,
): "visible" | "hidden" | "veryHidden" {
  const hidden = workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden;
  if (hidden === 2) {
    return "veryHidden";
  }
  if (hidden === 1) {
    return "hidden";
  }
  return "visible";
}

function isDateCell(cell: WorksheetCell): boolean {
  return typeof cell.z === "string" && XLSX.SSF.is_date(cell.z);
}

function excelSerialToIso(value: number, dateSystem: "1900" | "1904"): string {
  const epoch = dateSystem === "1904"
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  return new Date(epoch + value * EXCEL_DAY_MS).toISOString();
}

function sanitizeString(text: string, maxBytes: number, digestKey: string): string {
  let sanitized = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      continue;
    }
    sanitized += text[index];
  }
  if (Buffer.byteLength(sanitized, "utf8") > maxBytes) {
    throw typedError("limit_exceeded", "XLSX text exceeds configured limit", digestKey);
  }
  return sanitized;
}

function compareCellAddresses(left: string, right: string): number {
  const leftCell = XLSX.utils.decode_cell(left);
  const rightCell = XLSX.utils.decode_cell(right);
  return leftCell.r - rightCell.r || leftCell.c - rightCell.c;
}

function mapXlsxError(error: unknown): DocumentCapabilityHandlerError {
  const message = error instanceof Error ? error.message : "Unknown XLSX parser error";
  if (/password|encrypted/i.test(message)) {
    return typedError("encrypted", "XLSX is encrypted", "xlsx_encrypted");
  }
  if (/Unsupported|not supported/i.test(message)) {
    return typedError("unsupported_feature", "XLSX uses an unsupported feature", "xlsx_unsupported");
  }
  if (/invalid|corrupt|zip|cfb|end of data|Bad|CRC/i.test(message)) {
    return typedError("corrupt", "XLSX is corrupt or unsupported", "xlsx_parse");
  }
  return typedError("internal_failure", "An unexpected XLSX parser error occurred", "xlsx_internal");
}

function typedError(
  code: "invalid_format" | "encrypted" | "corrupt" | "limit_exceeded" | "unsupported_feature" | "internal_failure",
  message: string,
  digestKey: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, digestKey),
  );
}
