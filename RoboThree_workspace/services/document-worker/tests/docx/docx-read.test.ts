import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ParserExecutionBoundary,
  readDocx,
  validateDocxOoxmlPreflight,
} from "../../src/index.js";
import {
  makeDocxSpikeFixture,
  truncateDocx,
} from "../fixtures/docx-fixtures.js";

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
  maxBlocks: null,
  maxTextBytes: null,
  maxTableRows: null,
  maxTableCells: null,
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
  bytes = makeDocxSpikeFixture({ includeSectionBreak: true }),
  overrides: Partial<Parameters<typeof readDocx>[0]> = {},
) {
  return readDocx({
    bytes,
    extension: "docx",
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
    capabilityId: "tool.document.docx.read",
    options: {},
    limits: DEFAULT_LIMITS,
    extension: "docx",
    bytes,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("DOCX read", () => {
  it("extracts canonical blocks with owned section, paragraph, table, row, and cell locators", async () => {
    const result = await readFixture();
    const output = result.output as {
      format: string;
      metadata: { sectionCount: number };
      blocks: Array<{
        kind: string;
        locator: Record<string, number>;
        content?: string;
        rows?: Array<{
          cells: Array<{
            content: string;
            colSpan: number;
            rowSpan: number;
            locator: Record<string, number>;
          }>;
        }>;
      }>;
    };

    expect(output.format).toBe("docx");
    expect(output.metadata.sectionCount).toBe(2);
    expect(output.blocks).toMatchObject([
      {
        kind: "heading",
        locator: { sectionIndex: 1, blockIndex: 1, paragraphIndex: 1 },
        content: "标题 Alpha",
      },
      {
        kind: "paragraph",
        locator: { sectionIndex: 1, blockIndex: 2, paragraphIndex: 2 },
        content: "段落 Unicode 你好 β",
      },
      {
        kind: "list_item",
        locator: { sectionIndex: 1, blockIndex: 3, paragraphIndex: 3 },
        content: "列表一",
      },
      {
        kind: "list_item",
        locator: { sectionIndex: 1, blockIndex: 4, paragraphIndex: 4 },
        content: "列表二",
      },
      {
        kind: "table",
        locator: { sectionIndex: 2, blockIndex: 5, tableIndex: 1 },
      },
    ]);
    expect(output.blocks[4]!.rows![0]!.cells[0]).toMatchObject({
      content: "合并单元格",
      colSpan: 2,
      rowSpan: 1,
      locator: { sectionIndex: 2, tableIndex: 1, rowIndex: 1, cellIndex: 1 },
    });
    expect(output.blocks[4]!.rows![1]!.cells[0]).toMatchObject({
      content: "跨行",
      colSpan: 1,
      rowSpan: 2,
    });
    expect(result.metadata).toMatchObject({
      originalCount: 5,
      returnedCount: 5,
      truncated: false,
    });
    expect(result.metadata.locators).toContainEqual({
      sectionIndex: 2,
      tableIndex: 1,
      rowIndex: 1,
      cellIndex: 1,
    });
    expect(JSON.stringify(output)).not.toContain("<p");
  });

  it("fails closed for DOCM, macros, external relationships, unsafe ZIP names, encrypted entries, corrupt ZIP, and ratios", async () => {
    await expect(readFixture(undefined, { extension: "docm" })).rejects.toMatchObject({
      code: "invalid_format",
    });
    await expect(
      readFixture(makeDocxSpikeFixture({ extension: "docm" })),
    ).rejects.toMatchObject({ code: "unsupported_feature" });
    await expect(
      readFixture(makeDocxSpikeFixture({ includeMacro: true })),
    ).rejects.toMatchObject({ code: "unsupported_feature" });
    await expect(
      readFixture(makeDocxSpikeFixture({ externalRelationship: true })),
    ).rejects.toMatchObject({ code: "unsupported_feature" });
    await expect(
      readFixture(makeDocxSpikeFixture({ zipSlipEntryName: "word\\..\\evil.xml" })),
    ).rejects.toMatchObject({ code: "invalid_format" });
    await expect(
      readFixture(makeDocxSpikeFixture({ encryptFirstEntry: true })),
    ).rejects.toMatchObject({ code: "encrypted" });
    await expect(readFixture(truncateDocx(makeDocxSpikeFixture()))).rejects.toMatchObject({
      code: "corrupt",
    });
    await expect(
      readFixture(undefined, {
        limits: {
          ...DEFAULT_LIMITS,
          maxDecompressionRatio: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("enforces block, text, table row, table cell, and output budgets", async () => {
    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxBlocks: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxTextBytes: 4,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxTableRows: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      readFixture(undefined, {
        options: {
          ...DEFAULT_OPTIONS,
          maxTableCells: 1,
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

  it("preflights central directory and required DOCX OOXML package entries before parsing", () => {
    const preflight = validateDocxOoxmlPreflight(
      makeDocxSpikeFixture(),
      "docx",
      DEFAULT_LIMITS,
    );

    expect(preflight.entryCount).toBeGreaterThan(3);
    expect(preflight.totalCompressedBytes).toBeGreaterThan(0);
    expect(preflight.totalUncompressedBytes).toBeGreaterThan(0);
    expect(preflight.entries.map((entry) => entry.name)).toContain("word/document.xml");
  });

  it("uses transferable bytes and keeps real parser worker cycles bounded", async () => {
    const boundary = new ParserExecutionBoundary({
      workerFactory: realWorkerFactory(),
    });

    for (let index = 0; index < 5; index += 1) {
      const bytes = standaloneBytes(makeDocxSpikeFixture({ includeSectionBreak: true }));
      const promise = boundary.execute(parserRequest(bytes, {
        attemptKey: `docx-${index}:act:eff`,
      }));

      expect(bytes.bytes.byteLength).toBe(0);
      const result = await promise;
      expect(result.output).toMatchObject({ format: "docx" });
      expect((result.output as { blocks: Array<{ kind: string }> }).blocks[0]).toMatchObject({
        kind: "heading",
      });
      expect(boundary.snapshot()).toMatchObject({
        activeExecutionCount: 0,
        pendingListenerCount: 0,
      });
    }

    expect(boundary.snapshot().spawnedExecutionCount).toBe(5);
  });
});
