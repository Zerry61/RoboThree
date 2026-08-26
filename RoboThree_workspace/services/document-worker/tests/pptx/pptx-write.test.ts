import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it, afterEach } from "vitest";
import {
  DOCUMENT_CAPABILITIES,
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentCapabilityRouter,
  PPTX_WRITE_CAPABILITY_ID,
  computePptxWriteRequestDigest,
  generatePptxBytes,
  normalizePptxWriteOptions,
  writePptx,
} from "../../src/index.js";

import type {
  DocumentWorkerInvokeMessage,
  DocumentWorkerLimits,
  PptxWriteOutput,
} from "../../src/index.js";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 2_000_000,
  maxOutputBytes: 8_000_000,
  maxPageCount: 40,
  maxDecompressionRatio: 100,
};
const IDEMPOTENCY_KEY = "ptx-1-idempotency-key";

const PRESENTATION_OPTIONS: Record<string, unknown> = {
  presentation: {
    title: "Quarterly Plan",
    layout: "wide",
    templateRef: "robothree.default",
    slides: [
      {
        title: "计划总览",
        elements: [
          {
            type: "text",
            text: "RoboThree PPTX writer",
            x: 0.8,
            y: 1.1,
            w: 5,
            h: 0.6,
            style: { fontSize: 18, color: "111827", bold: true, align: "left" },
          },
          {
            type: "image",
            source: {
              type: "data",
              mediaType: "image/png",
              dataBase64: PNG_BYTES.toString("base64"),
            },
            x: 6.5,
            y: 1.0,
            w: 1,
            h: 1,
            altText: "Logo",
          },
          {
            type: "table",
            rows: [["Metric", "Value"], ["Revenue", "42"]],
            x: 0.8,
            y: 2.0,
            w: 5,
            h: 1.2,
          },
          {
            type: "chart",
            chartType: "bar",
            labels: ["A", "B"],
            series: [{ name: "Score", values: [1, 2] }],
            x: 6.5,
            y: 2.0,
            w: 4,
            h: 2.2,
          },
          {
            type: "shape",
            shapeType: "rect",
            x: 0.8,
            y: 3.6,
            w: 2,
            h: 0.5,
            fillColor: "E5E7EB",
            lineColor: "6B7280",
          },
        ],
      },
    ],
  },
} as const;

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe("PPTX write private foundation", () => {
  it("generates and publishes a no-clobber PPTX with a readable OOXML structure", async () => {
    const root = await makeWorkspace();
    const relativePath = "reports/quarterly.pptx";
    const normalized = normalizePptxWriteOptions(PRESENTATION_OPTIONS, LIMITS);
    const result = await writePptx({
      workspaceRoot: root,
      relativePath,
      options: PRESENTATION_OPTIONS,
      limits: LIMITS,
      signal: new AbortController().signal,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestDigest: computePptxWriteRequestDigest(
        IDEMPOTENCY_KEY,
        relativePath,
        normalized.presentation,
      ),
    });

    const output = result.output as PptxWriteOutput;
    const path = join(root, relativePath);
    const bytes = await readFile(path);
    const zip = readZipEntries(bytes);
    expect(output).toMatchObject({
      format: "pptx",
      relativePath,
      slideCount: 1,
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(output.byteSize).toBe(bytes.byteLength);
    expect(zip.has("[Content_Types].xml")).toBe(true);
    expect(zip.has("ppt/presentation.xml")).toBe(true);
    expect(inflateZipEntry(zip, "ppt/slides/slide1.xml").toString("utf8")).toContain("计划总览");
    expect((await readdir(join(root, "reports"))).filter((name) => name.includes(".robothree-ptx-"))).toEqual([]);
  });

  it("keeps document.pptx.write private and fails closed on public protocol", async () => {
    const root = await makeWorkspace();
    const relativePath = "private-router.pptx";
    const normalized = normalizePptxWriteOptions(PRESENTATION_OPTIONS, LIMITS);
    const invoke: DocumentWorkerInvokeMessage = {
      type: "invoke",
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      requestId: "req-ptx",
      actionId: "act-ptx",
      effectAttemptId: "eff-ptx",
      capabilityId: PPTX_WRITE_CAPABILITY_ID,
      workspaceRoot: root,
      relativePath,
      options: PRESENTATION_OPTIONS,
      limits: LIMITS,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      idempotencyKey: IDEMPOTENCY_KEY,
      requestDigest: computePptxWriteRequestDigest(
        IDEMPOTENCY_KEY,
        relativePath,
        normalized.presentation,
      ),
    };

    expect(DOCUMENT_CAPABILITIES).not.toContain(PPTX_WRITE_CAPABILITY_ID);
    const result = await new DocumentCapabilityRouter().invoke({
      invoke,
      signal: new AbortController().signal,
    });
    expect((result.output as PptxWriteOutput).relativePath).toBe(relativePath);
    expect(existsSync(join(root, relativePath))).toBe(true);

    await expect(new DocumentCapabilityRouter().invoke({
      invoke: {
        ...invoke,
        protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
        relativePath: "public-router.pptx",
      },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "private_protocol_required",
    });
  });

  it("does not overwrite existing targets and cleans temp files on publish failure", async () => {
    const root = await makeWorkspace();
    const target = "reports/existing.pptx";
    await writeFile(join(root, target), Buffer.from("existing"));
    await expect(writePptx({
      workspaceRoot: root,
      relativePath: target,
      options: PRESENTATION_OPTIONS,
      limits: LIMITS,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "target_exists",
    });
    expect(await readFile(join(root, target), "utf8")).toBe("existing");
    expect((await readdir(join(root, "reports"))).filter((name) => name.includes(".robothree-ptx-"))).toEqual([]);
  });

  it("bounds slides, resource bytes, and output bytes", async () => {
    const tooManySlides = {
      presentation: {
        title: "Too many",
        slides: Array.from({ length: 41 }, (_value, index) => ({
          title: `Slide ${index}`,
          elements: [],
        })),
      },
    };
    expect(() => normalizePptxWriteOptions(tooManySlides, LIMITS)).toThrow(
      expect.objectContaining({ detailCode: "input_too_large" }),
    );

    await expect(writePptx({
      workspaceRoot: await makeWorkspace(),
      relativePath: "reports/tiny-limit.pptx",
      options: PRESENTATION_OPTIONS,
      limits: { ...LIMITS, maxOutputBytes: 1024 },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "limit_exceeded",
      detailCode: "output_too_large",
    });
  });

  it("keeps the PptxGenJS adapter isolated from network and filesystem reads", async () => {
    const adapterSource = readFileSync(
      new URL("../../src/pptx/pptx-adapter.ts", import.meta.url),
      "utf8",
    );
    expect(adapterSource).not.toMatch(/node:(?:fs|path|net|http|https|tls|dns|dgram)/);
    expect(adapterSource).not.toMatch(/\b(?:fetch|writeFile|readFile|createReadStream|https\.request|http\.request)\b/);
    expect(adapterSource).not.toContain("addImage({ path");

    const normalized = normalizePptxWriteOptions(PRESENTATION_OPTIONS, LIMITS);
    const resolved = {
      ...normalized.presentation,
      slides: normalized.presentation.slides.map((slide) => ({
        ...slide,
        elements: slide.elements.map((element) =>
          element.type === "image"
            ? {
                type: "image" as const,
                x: element.x,
                y: element.y,
                w: element.w,
                h: element.h,
                altText: element.altText,
                mediaType: "image/png" as const,
                bytes: PNG_BYTES,
                sha256: "fixture",
              }
            : element,
        ),
      })),
    };
    await expect(generatePptxBytes(resolved)).resolves.toSatisfy((bytes: Buffer) =>
      bytes.subarray(0, 2).toString("ascii") === "PK",
    );
  });
});

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ptx-write-"));
  tempRoots.push(root);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, "reports")));
  return root;
}

type ZipEntry = Readonly<{
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
  data: Buffer;
}>;

function readZipEntries(bytes: Buffer): Map<string, ZipEntry> {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, {
      compression,
      compressedSize,
      localHeaderOffset,
      data: bytes.subarray(dataOffset, dataOffset + compressedSize),
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateZipEntry(entries: Map<string, ZipEntry>, name: string): Buffer {
  const entry = entries.get(name);
  expect(entry, name).toBeDefined();
  if (entry?.compression === 0) return entry.data;
  if (entry?.compression === 8) return inflateRawSync(entry.data);
  throw new Error(`Unsupported ZIP compression for ${name}: ${entry?.compression}`);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("ZIP EOCD not found");
}
