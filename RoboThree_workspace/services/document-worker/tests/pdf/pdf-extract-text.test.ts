import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractPdfText,
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
  overrides: Partial<Parameters<typeof extractPdfText>[0]> = {},
) {
  return extractPdfText({
    bytes,
    extension: "pdf",
    limits: DEFAULT_LIMITS,
    options: {
      pageStart: 1,
      pageEnd: null,
      maxTextBytes: null,
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
    capabilityId: "tool.document.pdf.extract_text",
    options: {},
    limits: DEFAULT_LIMITS,
    extension: "pdf",
    bytes,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("PDF extract_text", () => {
  it("extracts single-page text with page metadata and locators", async () => {
    const result = await extract(makePdfFixture([{ text: "Hello DTP-1A" }]));

    expect(result.output).toMatchObject({
      format: "pdf",
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: "Hello DTP-1A",
          rotation: 0,
          empty: false,
        },
      ],
    });
    expect(result.metadata).toMatchObject({
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      locators: [{ pageNumber: 1 }],
    });
    expect(result.metadata.resultDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("extracts selected pages, unicode text, blank pages, and rotation", async () => {
    const result = await extract(
      makePdfFixture([
        { text: "skip" },
        { unicodeText: "你好 Robothree" },
        { blank: true, rotate: 90 },
      ]),
      {
        options: {
          pageStart: 2,
          pageEnd: 3,
          maxTextBytes: null,
        },
      },
    );

    expect(result.output).toMatchObject({
      format: "pdf",
      pageCount: 3,
      pages: [
        {
          pageNumber: 2,
          text: "你好 Robothree",
          rotation: 0,
          empty: false,
        },
        {
          pageNumber: 3,
          text: "",
          rotation: 90,
          empty: true,
        },
      ],
    });
    expect(result.metadata.locators).toEqual([
      { pageNumber: 2 },
      { pageNumber: 3 },
    ]);
  });

  it("sanitizes control characters and preserves protocol-looking text as data", async () => {
    const result = await extract(
      makePdfFixture([
        {
          text: "before\u0000\n{\"type\":\"ready\"}\u0007 after",
        },
      ]),
    );

    expect(JSON.stringify(result.output)).not.toContain("\\u0000");
    expect(JSON.stringify(result.output)).not.toContain("\\u0007");
    expect(JSON.stringify(result.output)).toContain('\\"type\\":\\"ready\\"');
  });

  it("fails closed for extension mismatch, corrupt/truncated PDFs, encrypted PDFs, and output budgets", async () => {
    await expect(
      extract(makePdfFixture([{ text: "wrong extension" }]), {
        extension: "txt",
      }),
    ).rejects.toMatchObject({ code: "invalid_format" });

    await expect(extract(makeCorruptPdfFixture())).rejects.toMatchObject({
      code: "corrupt",
    });

    await expect(extract(makeEncryptedLikePdfFixture())).rejects.toMatchObject({
      code: "encrypted",
    });

    await expect(
      extract(makePdfFixture([{ text: "too much text" }]), {
        limits: {
          ...DEFAULT_LIMITS,
          maxOutputBytes: 4,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });

    await expect(
      extract(makePdfFixture([{ text: "one" }, { text: "two" }]), {
        limits: {
          ...DEFAULT_LIMITS,
          maxPageCount: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("uses transferable bytes and keeps real parser worker cycles bounded", async () => {
    const boundary = new ParserExecutionBoundary({
      workerFactory: realWorkerFactory(),
    });

    for (let index = 0; index < 5; index += 1) {
      const bytes = standaloneBytes(makePdfFixture([{ text: `cycle ${index}` }]));
      const promise = boundary.execute(parserRequest(bytes, {
        attemptKey: `req-${index}:act:eff`,
      }));

      expect(bytes.bytes.byteLength).toBe(0);
      await expect(promise).resolves.toMatchObject({
        output: {
          format: "pdf",
          pages: [
            {
              pageNumber: 1,
              text: `cycle ${index}`,
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
  });
});
