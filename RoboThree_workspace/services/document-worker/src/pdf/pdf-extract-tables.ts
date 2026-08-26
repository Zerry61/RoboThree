import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { computeErrorDigest, computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type { PdfExtractTablesOptions } from "../handlers/index.js";
import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";

type PdfExtractTablesRequest = Readonly<{
  bytes: Uint8Array;
  extension: string;
  limits: DocumentWorkerLimits;
  options: PdfExtractTablesOptions;
}>;

type PdfExtractTablesOutput = Readonly<{
  format: "pdf";
  extraction: "tables";
  pageCount: number;
  selectedPageCount: number;
  tables: readonly PdfTable[];
  warnings: readonly PdfTableWarning[];
}>;

type PdfTable = Readonly<{
  pageNumber: number;
  tableIndex: number;
  rowCount: number;
  columnCount: number;
  confidence: number;
  locator: PdfTableLocator;
  bbox?: PdfPageBox;
  rows: readonly PdfTableRow[];
  warnings: readonly PdfTableWarning[];
}>;

type PdfTableRow = Readonly<{
  rowIndex: number;
  bbox?: PdfPageBox;
  cells: readonly PdfTableCell[];
}>;

type PdfTableCell = Readonly<{
  rowIndex: number;
  columnIndex: number;
  text: string;
  bbox?: PdfPageBox;
  confidence: number;
  warnings: readonly PdfTableWarning[];
}>;

type PdfTableLocator = Readonly<{
  pageNumber: number;
  tableIndex: number;
}>;

type PdfPageBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "pdf_point";
  origin: "top_left";
}>;

type PdfTableWarning =
  | "low_confidence"
  | "ambiguous_columns"
  | "ambiguous_rows"
  | "merged_cells_not_supported"
  | "rotated_text_ignored"
  | "table_truncated"
  | "page_truncated";

type PdfJsModule = Readonly<{
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<PdfDocumentProxy>;
  };
}>;

type PdfDocumentProxy = Readonly<{
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
}>;

type PdfPageProxy = Readonly<{
  rotate: number;
  view?: readonly number[];
  getTextContent: (params?: Record<string, unknown>) => Promise<{
    items: readonly unknown[];
  }>;
  cleanup?: () => void;
}>;

type TextItemLike = Readonly<{
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}>;

type TextBox = Readonly<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}>;

type RowCluster = Readonly<{
  y: number;
  boxes: readonly TextBox[];
  bbox: PdfPageBox;
}>;

type TableCandidate = Readonly<{
  rows: readonly RowCluster[];
  columns: readonly ColumnCluster[];
  confidence: number;
  warnings: readonly PdfTableWarning[];
}>;

type ColumnCluster = Readonly<{
  x: number;
}>;

const DEFAULT_MAX_TABLES = 20;
const DEFAULT_MAX_ROWS = 1_000;
const DEFAULT_MAX_CELLS = 5_000;
const DEFAULT_MIN_CONFIDENCE = 0.6;
const MAX_TEXT_ITEMS_PER_PAGE = 10_000;
const MAX_TOTAL_TEXT_ITEMS = 50_000;
const ROW_Y_TOLERANCE = 4;
const COLUMN_X_TOLERANCE = 12;
const TABLE_VERTICAL_GAP = 32;
const MIN_TABLE_ROWS = 2;
const MIN_TABLE_COLUMNS = 2;

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

export async function extractPdfTables(
  request: PdfExtractTablesRequest,
): Promise<DocumentCapabilityResult> {
  validatePdfBytes(request.bytes, request.extension);

  const startedAt = Date.now();
  const pdfjs = await loadPdfJs();
  let document: PdfDocumentProxy | null = null;

  try {
    const task = pdfjs.getDocument({
      data: request.bytes,
      disableAutoFetch: true,
      disableFontFace: true,
      disableRange: true,
      isEvalSupported: false,
      useSystemFonts: false,
      cMapPacked: true,
      cMapUrl: packageAssetUrl("cmaps"),
      standardFontDataUrl: packageAssetUrl("standard_fonts"),
    });
    document = await task.promise;
    const pageCount = document.numPages;
    const pageStart = request.options.pageStart;
    const pageEnd = Math.min(request.options.pageEnd ?? pageCount, pageCount);
    const selectedPageCount = pageEnd >= pageStart ? pageEnd - pageStart + 1 : 0;
    if (selectedPageCount > request.limits.maxPageCount) {
      throw typedError(
        "limit_exceeded",
        "PDF selected page count exceeds configured limit",
        "pdf_table_page_count",
      );
    }
    if (pageStart > pageCount) {
      throw typedError(
        "invalid_format",
        "PDF pageStart is outside the document",
        "pdf_table_page_range",
      );
    }

    const maxOutputBytes = request.options.maxTextBytes ?? request.limits.maxOutputBytes;
    if (maxOutputBytes > request.limits.maxOutputBytes) {
      throw typedError(
        "limit_exceeded",
        "PDF requested table output budget exceeds configured limit",
        "pdf_table_output",
      );
    }

    const maxTables = request.options.maxTables ?? DEFAULT_MAX_TABLES;
    const maxRows = request.options.maxRows ?? DEFAULT_MAX_ROWS;
    const maxCells = request.options.maxCells ?? DEFAULT_MAX_CELLS;
    const minConfidence = request.options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    const tables: PdfTable[] = [];
    const outputWarnings = new Set<PdfTableWarning>();
    let totalTextItems = 0;
    let totalOutputBytes = 0;
    let totalCandidates = 0;
    let truncated = false;

    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await withSuppressedConsoleWarnings(() =>
        page.getTextContent({ disableNormalization: false }),
      );
      const items = textContent.items;
      if (items.length > MAX_TEXT_ITEMS_PER_PAGE) {
        page.cleanup?.();
        throw typedError(
          "limit_exceeded",
          "PDF page text item count exceeds table extraction limit",
          "pdf_table_text_items",
        );
      }
      totalTextItems += items.length;
      if (totalTextItems > MAX_TOTAL_TEXT_ITEMS) {
        page.cleanup?.();
        throw typedError(
          "limit_exceeded",
          "PDF text item count exceeds table extraction limit",
          "pdf_table_text_items",
        );
      }

      const pageHeight = pageHeightPoints(page);
      const boxes = textBoxes(items, pageHeight);
      if (boxes.some((box) => box.rotated)) {
        outputWarnings.add("rotated_text_ignored");
      }
      const candidates = detectTableCandidates(
        boxes.filter((box) => !box.rotated),
        minConfidence,
      );
      totalCandidates += candidates.length;
      for (const candidate of candidates) {
        if (tables.length >= maxTables) {
          truncated = true;
          outputWarnings.add("table_truncated");
          break;
        }
        const table = candidateToTable(
          candidate,
          pageNumber,
          tables.filter((existing) => existing.pageNumber === pageNumber).length + 1,
          request.options.includeGeometry,
        );
        enforceTableBudgets(table, {
          maxRows,
          maxCells,
          maxOutputBytes,
          currentOutputBytes: totalOutputBytes,
        });
        totalOutputBytes += tableTextBytes(table);
        tables.push(table);
      }
      page.cleanup?.();
    }

    if (totalTextItems === 0) {
      throw typedError(
        "unsupported_feature",
        "PDF has no usable text layer for table extraction",
        "pdf_table_no_text_layer",
      );
    }

    const output: PdfExtractTablesOutput = {
      format: "pdf",
      extraction: "tables",
      pageCount,
      selectedPageCount,
      tables,
      warnings: [...outputWarnings],
    };
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: totalCandidates,
      returnedCount: tables.length,
      truncated,
      resultDigest: computeResultDigest(output),
      locators: tables.map((table) => table.locator),
      timingMs: Date.now() - startedAt,
    };
    return { output, metadata };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      throw error;
    }
    throw mapPdfError(error);
  } finally {
    await document?.destroy?.();
  }
}

function detectTableCandidates(
  boxes: readonly TextBox[],
  minConfidence: number,
): readonly TableCandidate[] {
  const rows = clusterRows(boxes);
  const segments = splitTableSegments(rows);
  const candidates: TableCandidate[] = [];
  for (const segment of segments) {
    if (segment.length < MIN_TABLE_ROWS) {
      continue;
    }
    const columns = clusterColumns(segment.flatMap((row) => row.boxes));
    if (columns.length < MIN_TABLE_COLUMNS) {
      continue;
    }
    const confidence = scoreCandidate(segment, columns);
    const warnings = candidateWarnings(segment, columns, confidence);
    if (confidence < minConfidence) {
      continue;
    }
    candidates.push({ rows: segment, columns, confidence, warnings });
  }
  return candidates;
}

function clusterRows(boxes: readonly TextBox[]): readonly RowCluster[] {
  const rows: Array<{ yValues: number[]; boxes: TextBox[] }> = [];
  const sorted = [...boxes].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const box of sorted) {
    const centerY = box.y + box.height / 2;
    const row = rows.find((candidate) =>
      Math.abs(average(candidate.yValues) - centerY) <= ROW_Y_TOLERANCE
    );
    if (row === undefined) {
      rows.push({ yValues: [centerY], boxes: [box] });
    } else {
      row.yValues.push(centerY);
      row.boxes.push(box);
    }
  }
  return rows
    .map((row) => ({
      y: average(row.yValues),
      boxes: row.boxes.sort((left, right) => left.x - right.x),
      bbox: unionBox(row.boxes),
    }))
    .sort((left, right) => left.y - right.y);
}

function splitTableSegments(rows: readonly RowCluster[]): readonly RowCluster[][] {
  const segments: RowCluster[][] = [];
  let current: RowCluster[] = [];
  let previous: RowCluster | undefined;
  for (const row of rows) {
    const startsNew = previous !== undefined &&
      row.y - previous.y > TABLE_VERTICAL_GAP;
    if (startsNew && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(row);
    previous = row;
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

function clusterColumns(boxes: readonly TextBox[]): readonly ColumnCluster[] {
  const clusters: Array<{ xs: number[] }> = [];
  const sorted = [...boxes].sort((left, right) => left.x - right.x);
  for (const box of sorted) {
    const cluster = clusters.find((candidate) =>
      Math.abs(average(candidate.xs) - box.x) <= COLUMN_X_TOLERANCE
    );
    if (cluster === undefined) {
      clusters.push({ xs: [box.x] });
    } else {
      cluster.xs.push(box.x);
    }
  }
  return clusters
    .map((cluster) => ({ x: average(cluster.xs) }))
    .sort((left, right) => left.x - right.x);
}

function scoreCandidate(
  rows: readonly RowCluster[],
  columns: readonly ColumnCluster[],
): number {
  const rowCellCounts = rows.map((row) => countMatchedCells(row, columns));
  const completeRows = rowCellCounts.filter((count) => count >= Math.max(2, columns.length - 1)).length;
  const coverage = completeRows / rows.length;
  const density = Math.min(
    1,
    rowCellCounts.reduce((sum, count) => sum + count, 0) / (rows.length * columns.length),
  );
  const consistency = 1 - Math.min(1, standardDeviation(rowCellCounts) / Math.max(1, columns.length));
  return roundConfidence((coverage * 0.45) + (density * 0.35) + (consistency * 0.2));
}

function candidateWarnings(
  rows: readonly RowCluster[],
  columns: readonly ColumnCluster[],
  confidence: number,
): readonly PdfTableWarning[] {
  const warnings = new Set<PdfTableWarning>();
  if (confidence < 0.8) {
    warnings.add("low_confidence");
  }
  if (rows.some((row) => countMatchedCells(row, columns) < columns.length)) {
    warnings.add("ambiguous_columns");
  }
  const yGaps = rows.slice(1).map((row, index) => {
    const previous = rows[index];
    return previous === undefined ? 0 : row.y - previous.y;
  });
  if (standardDeviation(yGaps) > 8) {
    warnings.add("ambiguous_rows");
  }
  return [...warnings];
}

function candidateToTable(
  candidate: TableCandidate,
  pageNumber: number,
  tableIndex: number,
  includeGeometry: boolean,
): PdfTable {
  const rows: PdfTableRow[] = candidate.rows.map((row, rowIndex) => {
    const cells = candidate.columns.map((column, columnIndex) => {
      const matched = nearestBox(row.boxes, column.x);
      const text = matched === undefined ? "" : matched.text;
      const cell: PdfTableCell = {
        rowIndex: rowIndex + 1,
        columnIndex: columnIndex + 1,
        text,
        confidence: matched === undefined ? 0.5 : candidate.confidence,
        warnings: matched === undefined ? ["ambiguous_columns"] : [],
        ...(includeGeometry && matched !== undefined ? { bbox: boxToPageBox(matched) } : {}),
      };
      return cell;
    });
    return {
      rowIndex: rowIndex + 1,
      ...(includeGeometry ? { bbox: row.bbox } : {}),
      cells,
    };
  });
  const tableBox = unionPageBoxes(
    candidate.rows.map((row) => row.bbox),
  );
  return {
    pageNumber,
    tableIndex,
    rowCount: rows.length,
    columnCount: candidate.columns.length,
    confidence: candidate.confidence,
    locator: { pageNumber, tableIndex },
    ...(includeGeometry ? { bbox: tableBox } : {}),
    rows,
    warnings: candidate.warnings,
  };
}

function textBoxes(items: readonly unknown[], pageHeight: number): readonly TextBox[] {
  const boxes: TextBox[] = [];
  for (const item of items) {
    const text = itemText(item);
    if (text.length === 0) {
      continue;
    }
    const transform = (item as TextItemLike).transform;
    if (!isPdfTransform(transform)) {
      continue;
    }
    const width = positiveNumber((item as TextItemLike).width) ?? Math.max(text.length * 5, 1);
    const height = positiveNumber((item as TextItemLike).height) ?? Math.max(Math.abs(transform[3]), 1);
    const rotated = Math.abs(transform[1]) > 0.01 || Math.abs(transform[2]) > 0.01;
    boxes.push({
      text,
      x: roundPoint(transform[4]),
      y: roundPoint(pageHeight - transform[5] - height),
      width: roundPoint(width),
      height: roundPoint(height),
      rotated,
    });
  }
  return boxes;
}

function nearestBox(
  boxes: readonly TextBox[],
  columnX: number,
): TextBox | undefined {
  let nearest: TextBox | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    const distance = Math.abs(box.x - columnX);
    if (distance < nearestDistance && distance <= COLUMN_X_TOLERANCE) {
      nearest = box;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function countMatchedCells(
  row: RowCluster,
  columns: readonly ColumnCluster[],
): number {
  return columns.filter((column) => nearestBox(row.boxes, column.x) !== undefined).length;
}

function enforceTableBudgets(
  table: PdfTable,
  budgets: Readonly<{
    maxRows: number;
    maxCells: number;
    maxOutputBytes: number;
    currentOutputBytes: number;
  }>,
): void {
  if (table.rowCount > budgets.maxRows) {
    throw typedError(
      "limit_exceeded",
      "PDF table row count exceeds configured limit",
      "pdf_table_rows",
    );
  }
  const cellCount = table.rows.reduce((sum, row) => sum + row.cells.length, 0);
  if (cellCount > budgets.maxCells) {
    throw typedError(
      "limit_exceeded",
      "PDF table cell count exceeds configured limit",
      "pdf_table_cells",
    );
  }
  const textBytes = tableTextBytes(table);
  if (budgets.currentOutputBytes + textBytes > budgets.maxOutputBytes) {
    throw typedError(
      "limit_exceeded",
      "PDF table text output exceeds configured limit",
      "pdf_table_output",
    );
  }
}

function tableTextBytes(table: PdfTable): number {
  return Buffer.byteLength(
    table.rows
      .flatMap((row) => row.cells.map((cell) => cell.text))
      .join("\n"),
    "utf8",
  );
}

function boxToPageBox(box: TextBox): PdfPageBox {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    unit: "pdf_point",
    origin: "top_left",
  };
}

function unionBox(boxes: readonly TextBox[]): PdfPageBox {
  return unionPageBoxes(boxes.map(boxToPageBox));
}

function unionPageBoxes(boxes: readonly PdfPageBox[]): PdfPageBox {
  const first = boxes[0];
  if (first === undefined) {
    return { x: 0, y: 0, width: 0, height: 0, unit: "pdf_point", origin: "top_left" };
  }
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const box of boxes.slice(1)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return {
    x: roundPoint(minX),
    y: roundPoint(minY),
    width: roundPoint(maxX - minX),
    height: roundPoint(maxY - minY),
    unit: "pdf_point",
    origin: "top_left",
  };
}

function pageHeightPoints(page: PdfPageProxy): number {
  const view = page.view;
  if (
    Array.isArray(view) &&
    typeof view[1] === "number" &&
    typeof view[3] === "number" &&
    view[3] > view[1]
  ) {
    return view[3] - view[1];
  }
  return 792;
}

function validatePdfBytes(bytes: Uint8Array, extension: string): void {
  if (extension !== "pdf") {
    throw typedError(
      "invalid_format",
      "PDF table extraction requires a .pdf file",
      "pdf_extension",
    );
  }
  if (
    bytes.byteLength < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    throw typedError(
      "invalid_format",
      "File content is not a PDF",
      "pdf_magic",
    );
  }
}

async function loadPdfJs(): Promise<PdfJsModule> {
  installMinimalPdfJsDomPolyfills();
  pdfjsModulePromise ??= withSuppressedConsoleWarnings(async () =>
    import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsModule>
  );
  return pdfjsModulePromise;
}

function installMinimalPdfJsDomPolyfills(): void {
  const globals = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    Path2D?: unknown;
    ImageData?: unknown;
  };
  if (!("DOMMatrix" in globals)) {
    globals.DOMMatrix = MinimalDOMMatrix;
  }
  if (!("Path2D" in globals)) {
    globals.Path2D = MinimalPath2D;
  }
  if (!("ImageData" in globals)) {
    globals.ImageData = MinimalImageData;
  }
}

class MinimalDOMMatrix {
  public a = 1;
  public b = 0;
  public c = 0;
  public d = 1;
  public e = 0;
  public f = 0;

  public constructor(init?: readonly number[]) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  public multiplySelf(): this { return this; }
  public preMultiplySelf(): this { return this; }
  public translate(): this { return this; }
  public scale(): this { return this; }
  public rotate(): this { return this; }
  public invertSelf(): this { return this; }
  public inverse(): this { return this; }
  public transformPoint<T>(point: T): T { return point; }
}

class MinimalPath2D {
  public addPath(): void {}
}

class MinimalImageData {
  public readonly data: Uint8ClampedArray;
  public readonly width: number;
  public readonly height: number;

  public constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

async function withSuppressedConsoleWarnings<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function packageAssetUrl(directory: "cmaps" | "standard_fonts"): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("pdfjs-dist/package.json");
  return `${pathToFileURL(join(dirname(packageJson), directory)).href}/`;
}

function itemText(item: unknown): string {
  const text = (item as TextItemLike).str;
  return typeof text === "string" ? sanitizeText(text.normalize("NFC").trim()) : "";
}

function sanitizeText(text: string): string {
  let sanitized = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      continue;
    }
    sanitized += text[index] ?? "";
  }
  return sanitized;
}

function mapPdfError(error: unknown): DocumentCapabilityHandlerError {
  const message = error instanceof Error ? error.message : "Unknown PDF parser error";
  if (/password|encrypted/i.test(message)) {
    return typedError("encrypted", "PDF is encrypted", "pdf_encrypted");
  }
  if (/Invalid PDF|Missing PDF|XRef|trailer|corrupt|FormatError/i.test(message)) {
    return typedError("corrupt", "PDF is corrupt or unsupported", "pdf_corrupt");
  }
  return typedError(
    "internal_failure",
    "An unexpected PDF parser error occurred",
    message,
  );
}

function typedError(
  code: "invalid_format" | "encrypted" | "corrupt" | "limit_exceeded" | "unsupported_feature" | "internal_failure",
  message: string,
  detailCode: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, detailCode),
    detailCode,
  );
}

function isPdfTransform(value: unknown): value is readonly [number, number, number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 6 &&
    value.slice(0, 6).every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length,
  );
}

function roundPoint(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
