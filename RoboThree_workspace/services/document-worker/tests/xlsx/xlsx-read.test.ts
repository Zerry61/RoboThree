import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ParserExecutionBoundary,
  readXlsx,
  validateXlsxOoxmlPreflight,
} from "../../src/index.js";
import {
  makeXlsxFixture,
  replaceCentralDirectoryName,
  setFirstCentralDirectoryEncrypted,
  setFirstCentralDirectoryUncompressedSize,
  truncateXlsx,
} from "../fixtures/xlsx-fixtures.js";

import type {
  DocumentWorkerLimits,
  ParserExecutionRequest,
  ParserWorkerFactory,
  StandaloneDocumentBytes,
} from "../../src/index.js";

const DIST_BOOTSTRAP = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "runtime",
  "parser-worker-bootstrap.js",
);

const DEFAULT_LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 2_000_000,
  maxOutputBytes: 2_000_000,
  maxPageCount: 10,
  maxDecompressionRatio: 100,
};

const DEFAULT_OPTIONS = {
  maxSheets: null,
  maxRowsPerSheet: null,
  maxColumnsPerSheet: null,
  maxCells: null,
  maxCellTextBytes: null,
};

function standaloneBytes(input: Uint8Array): StandaloneDocumentBytes {
  const arrayBuffer = new ArrayBuffer(input.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(input);
  return {
    bytes,
    byteLength: bytes.byteLength,
    transferList: [arrayBuffer],
  };
}

async function readFixture(
  bytes = makeXlsxFixture(),
  overrides: Partial<Parameters<typeof readXlsx>[0]> = {},
) {
  return readXlsx({
    bytes,
    extension: "xlsx",
    limits: DEFAULT_LIMITS,
    options: DEFAULT_OPTIONS,
    ...overrides,
  });
}

function realWorkerFactory(): ParserWorkerFactory {
  return (workerData, transferList, workerOptions) =>
    new Worker(DIST_BOOTSTRAP, {
      execArgv: [],
      ...workerOptions,
      workerData,
      transferList: [...transferList],
    });
}

function parserRequest(
  bytes: StandaloneDocumentBytes,
  overrides: Partial<ParserExecutionRequest> = {},
): ParserExecutionRequest {
  return {
    attemptKey: "req:act:eff",
    capabilityId: "tool.document.xlsx.read",
    options: {},
    limits: DEFAULT_LIMITS,
    extension: "xlsx",
    bytes,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("XLSX read", () => {
  it("extracts workbook sheets, used ranges, cell values, formulas, dates, and visibility", async () => {
    const result = await readFixture();

    const output = result.output as {
      format: string;
      dateSystem: string;
      sheets: Array<{
        index: number;
        name: string;
        visibility: string;
        usedRange: unknown;
        rows: Array<{ cells: Array<Record<string, unknown>> }>;
      }>;
    };
    expect(output.format).toBe("xlsx");
    expect(output.dateSystem).toBe("1900");
    expect(output.sheets).toHaveLength(3);
    expect(output.sheets[0]).toMatchObject({
      index: 0,
      name: "Visible",
      visibility: "visible",
      usedRange: {
        start: "A1",
        end: "C3",
        rowCount: 3,
        columnCount: 3,
      },
    });
    expect(output.sheets[1]).toMatchObject({ name: "Hidden", visibility: "hidden" });
    expect(output.sheets[2]).toMatchObject({ name: "VeryHidden", visibility: "veryHidden" });
    expect(output.sheets[0]!.rows[1]!.cells).toContainEqual({
      address: "B2",
      column: "B",
      type: "number",
      value: 42,
    });
    expect(output.sheets[0]!.rows[1]!.cells).toContainEqual({
      address: "C2",
      column: "C",
      type: "date",
      value: "2026-08-04T00:00:00.000Z",
    });
    expect(output.sheets[0]!.rows[2]!.cells).toContainEqual({
      address: "B3",
      column: "B",
      type: "number",
      value: 84,
      formula: "B2*2",
    });
    expect(JSON.stringify(result.output)).toContain("你好 SheetJS");
    expect(JSON.stringify(result.output)).not.toContain("\\u0000");
    expect(result.metadata).toMatchObject({
      originalCount: 3,
      returnedCount: 3,
      truncated: false,
    });
    expect(result.metadata.locators).toContainEqual({
      sheetIndex: 0,
      sheetName: "Visible",
      cell: "A1",
    });
  });

  it("fails closed for extension mismatch, corrupt ZIP, encrypted entries, zip slip, duplicates, active content, and ratio budgets", async () => {
    const bytes = makeXlsxFixture();

    await expect(readFixture(bytes, { extension: "xlsm" })).rejects.toMatchObject({
      code: "invalid_format",
    });
    await expect(readFixture(truncateXlsx(bytes))).rejects.toMatchObject({
      code: "corrupt",
    });
    await expect(
      readFixture(setFirstCentralDirectoryEncrypted(bytes)),
    ).rejects.toMatchObject({ code: "encrypted" });
    await expect(
      readFixture(replaceCentralDirectoryName(bytes, "xl/workbook.xml", "../workbook.xml")),
    ).rejects.toMatchObject({ code: "invalid_format" });
    await expect(
      readFixture(replaceCentralDirectoryName(bytes, "xl/metadata.xml", "xl/workbook.xml")),
    ).rejects.toMatchObject({ code: "invalid_format" });
    await expect(
      readFixture(replaceCentralDirectoryName(bytes, "docProps/app.xml", "xl/activeX/a.bin")),
    ).rejects.toMatchObject({ code: "unsupported_feature" });
    await expect(
      readFixture(setFirstCentralDirectoryUncompressedSize(bytes, 0xfffffff0), {
        limits: {
          ...DEFAULT_LIMITS,
          maxDecompressionRatio: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("enforces sheet, range, cell text, and output budgets", async () => {
    await expect(
      readFixture(undefined, {
        limits: {
          ...DEFAULT_LIMITS,
          maxPageCount: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxRowsPerSheet: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxCellTextBytes: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        limits: {
          ...DEFAULT_LIMITS,
          maxOutputBytes: 128,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("preflights central directory and required OOXML package entries before parsing", () => {
    const preflight = validateXlsxOoxmlPreflight(
      makeXlsxFixture(),
      "xlsx",
      DEFAULT_LIMITS,
    );

    expect(preflight.entryCount).toBeGreaterThan(4);
    expect(preflight.totalCompressedBytes).toBeGreaterThan(0);
    expect(preflight.totalUncompressedBytes).toBeGreaterThan(0);
    expect(preflight.entries.map((entry) => entry.name)).toContain("[Content_Types].xml");
  });

  it("uses transferable bytes and keeps real parser worker cycles bounded", async () => {
    const boundary = new ParserExecutionBoundary({
      workerFactory: realWorkerFactory(),
    });

    for (let index = 0; index < 5; index += 1) {
      const bytes = standaloneBytes(makeXlsxFixture());
      const promise = boundary.execute(parserRequest(bytes, {
        attemptKey: `xlsx-${index}:act:eff`,
      }));

      expect(bytes.bytes.byteLength).toBe(0);
      const result = await promise;
      expect(result.output).toMatchObject({ format: "xlsx" });
      expect((result.output as { sheets: Array<{ name: string }> }).sheets[0]).toMatchObject({
        name: "Visible",
      });
      expect(boundary.snapshot()).toMatchObject({
        activeExecutionCount: 0,
        pendingListenerCount: 0,
      });
    }

    expect(boundary.snapshot().spawnedExecutionCount).toBe(5);
  });
});
