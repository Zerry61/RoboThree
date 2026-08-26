import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractPdfTables,
  ParserExecutionBoundary,
} from "../../src/index.js";
import {
  makeCorruptPdfFixture,
  makeEncryptedLikePdfFixture,
  makePdfFixture,
} from "../fixtures/pdf-fixtures.js";

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
  maxFileBytes: 1024 * 1024,
  maxOutputBytes: 1024 * 1024,
  maxPageCount: 10,
  maxDecompressionRatio: 100,
};

function tableRuns(
  rows: readonly (readonly string[])[],
  startY = 720,
): { text: string; x: number; y: number }[] {
  const xs = [72, 180, 300, 420];
  const runs: { text: string; x: number; y: number }[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const x = xs[columnIndex];
      if (x === undefined) {
        throw new Error("Fixture supports up to four columns");
      }
      runs.push({
        text: cell,
        x,
        y: startY - (rowIndex * 22),
      });
    });
  });
  return runs;
}

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

async function extract(
  bytes: Uint8Array,
  overrides: Partial<Parameters<typeof extractPdfTables>[0]> = {},
) {
  return extractPdfTables({
    bytes,
    extension: "pdf",
    limits: DEFAULT_LIMITS,
    options: {
      pageStart: 1,
      pageEnd: null,
      maxTables: null,
      maxRows: null,
      maxCells: null,
      maxTextBytes: null,
      includeGeometry: false,
      minConfidence: null,
    },
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
    capabilityId: "tool.document.pdf.extract_tables",
    options: {},
    limits: DEFAULT_LIMITS,
    extension: "pdf",
    bytes,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("PDF extract_tables", () => {
  it("extracts a simple digitally-born table with locators and optional geometry", async () => {
    const result = await extract(
      makePdfFixture([
        {
          textRuns: tableRuns([
            ["Name", "Q1", "Q2"],
            ["Alpha", "10", "20"],
            ["Beta", "30", "40"],
          ]),
        },
      ]),
      {
        options: {
          pageStart: 1,
          pageEnd: null,
          maxTables: null,
          maxRows: null,
          maxCells: null,
          maxTextBytes: null,
          includeGeometry: true,
          minConfidence: null,
        },
      },
    );

    expect(result.output).toMatchObject({
      format: "pdf",
      extraction: "tables",
      pageCount: 1,
      selectedPageCount: 1,
      tables: [
        {
          pageNumber: 1,
          tableIndex: 1,
          rowCount: 3,
          columnCount: 3,
          locator: { pageNumber: 1, tableIndex: 1 },
        },
      ],
    });
    const output = result.output as {
      tables: Array<{ confidence: number; bbox?: { unit: string; origin: string } }>;
    };
    expect(output.tables[0]?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(output.tables[0]?.bbox).toMatchObject({
      unit: "pdf_point",
      origin: "top_left",
    });
    expect((result.output as {
      tables: Array<{ rows: Array<{ cells: Array<{ text: string }> }> }>;
    }).tables[0]?.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      "Name",
      "Q1",
      "Q2",
    ]);
    expect(result.metadata).toMatchObject({
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      locators: [{ pageNumber: 1, tableIndex: 1 }],
    });
  });

  it("keeps baseline evidence for whitespace, multiple tables, and multi-page fixtures", async () => {
    const whitespace = await extract(
      makePdfFixture([
        {
          textRuns: tableRuns([
            ["Region", "Sales"],
            ["North", "100"],
            ["South", "90"],
          ]),
        },
      ]),
    );
    const multiTable = await extract(
      makePdfFixture([
        {
          textRuns: [
            ...tableRuns([
              ["A", "B"],
              ["1", "2"],
            ], 720),
            ...tableRuns([
              ["C", "D"],
              ["3", "4"],
            ], 600),
          ],
        },
      ]),
    );
    const multiPage = await extract(
      makePdfFixture([
        { textRuns: tableRuns([["P1", "Value"], ["A", "1"]]) },
        { textRuns: tableRuns([["P2", "Value"], ["B", "2"]]) },
      ]),
    );

    expect(whitespace.output).toMatchObject({
      tables: [{ rowCount: 3, columnCount: 2 }],
    });
    expect(multiTable.output).toMatchObject({
      tables: [
        { pageNumber: 1, tableIndex: 1, rowCount: 2, columnCount: 2 },
        { pageNumber: 1, tableIndex: 2, rowCount: 2, columnCount: 2 },
      ],
    });
    expect(multiPage.output).toMatchObject({
      selectedPageCount: 2,
      tables: [
        { pageNumber: 1, tableIndex: 1 },
        { pageNumber: 2, tableIndex: 1 },
      ],
    });
  });

  it("rejects no-text-layer PDFs and paragraph-like non-tables without false positives", async () => {
    await expect(
      extract(makePdfFixture([{ blank: true }])),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "pdf_table_no_text_layer",
    });

    const result = await extract(
      makePdfFixture([
        {
          textRuns: [
            { text: "This is a normal paragraph line.", x: 72, y: 720 },
            { text: "It has no repeated columns.", x: 72, y: 700 },
            { text: "The extractor should not invent a table.", x: 72, y: 680 },
          ],
        },
      ]),
    );

    expect(result.output).toMatchObject({
      tables: [],
    });
    expect(result.metadata).toMatchObject({
      returnedCount: 0,
      truncated: false,
    });
  });

  it("fails closed for format, encryption, corrupt PDFs, page range, and budgets", async () => {
    await expect(
      extract(makePdfFixture([{ textRuns: tableRuns([["A", "B"], ["1", "2"]]) }]), {
        extension: "txt",
      }),
    ).rejects.toMatchObject({ code: "invalid_format" });

    await expect(extract(makeEncryptedLikePdfFixture())).rejects.toMatchObject({
      code: "encrypted",
      detailCode: "pdf_encrypted",
    });

    await expect(extract(makeCorruptPdfFixture())).rejects.toMatchObject({
      code: "corrupt",
      detailCode: "pdf_corrupt",
    });

    await expect(
      extract(makePdfFixture([{ textRuns: tableRuns([["A", "B"], ["1", "2"]]) }]), {
        options: {
          pageStart: 3,
          pageEnd: null,
          maxTables: null,
          maxRows: null,
          maxCells: null,
          maxTextBytes: null,
          includeGeometry: false,
          minConfidence: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "pdf_table_page_range",
    });

    await expect(
      extract(makePdfFixture([{ textRuns: tableRuns([["A", "B"], ["1", "2"]]) }]), {
        options: {
          pageStart: 1,
          pageEnd: null,
          maxTables: null,
          maxRows: 1,
          maxCells: null,
          maxTextBytes: null,
          includeGeometry: false,
          minConfidence: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "limit_exceeded",
      detailCode: "pdf_table_rows",
    });

    await expect(
      extract(makePdfFixture([{ textRuns: tableRuns([["A", "B"], ["1", "2"]]) }]), {
        options: {
          pageStart: 1,
          pageEnd: null,
          maxTables: null,
          maxRows: null,
          maxCells: 3,
          maxTextBytes: null,
          includeGeometry: false,
          minConfidence: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "limit_exceeded",
      detailCode: "pdf_table_cells",
    });
  });

  it("uses transferable bytes and keeps real parser worker cycles bounded", async () => {
    const boundary = new ParserExecutionBoundary({
      workerFactory: realWorkerFactory(),
    });

    for (let index = 0; index < 5; index += 1) {
      const bytes = standaloneBytes(
        makePdfFixture([
          {
            textRuns: tableRuns([
              ["Cycle", "Value"],
              [String(index), "ok"],
            ]),
          },
        ]),
      );
      const promise = boundary.execute(parserRequest(bytes, {
        attemptKey: `req-${index}:act:eff`,
      }));

      expect(bytes.bytes.byteLength).toBe(0);
      await expect(promise).resolves.toMatchObject({
        output: {
          format: "pdf",
          extraction: "tables",
          tables: [
            {
              pageNumber: 1,
              rowCount: 2,
              columnCount: 2,
            },
          ],
        },
      });
      expect(boundary.snapshot()).toMatchObject({
        activeExecutionCount: 0,
        pendingListenerCount: 0,
      });
    }

    expect(boundary.snapshot().spawnedExecutionCount).toBe(5);

    const blankBytes = standaloneBytes(makePdfFixture([{ blank: true }]));
    await expect(
      boundary.execute(parserRequest(blankBytes, {
        attemptKey: "req-blank:act:eff",
      })),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "pdf_table_no_text_layer",
    });
    expect(boundary.snapshot()).toMatchObject({
      activeExecutionCount: 0,
      pendingListenerCount: 0,
      spawnedExecutionCount: 6,
    });
  });
});
