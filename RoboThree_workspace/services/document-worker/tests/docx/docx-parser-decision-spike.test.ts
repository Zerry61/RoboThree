import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";

import {
  makeDocxSpikeFixture,
  truncateDocx,
} from "../fixtures/docx-fixtures.js";

type MammothDocument = Readonly<{
  type: "document";
  children: readonly MammothElement[];
}>;

type MammothElement = Readonly<{
  type: string;
  children?: readonly MammothElement[];
  value?: string;
  styleName?: string | null;
  numbering?: unknown;
  colSpan?: number;
  rowSpan?: number;
}>;

type SpikeBlock = Readonly<{
  kind: "heading" | "paragraph" | "list_item" | "table";
  locator: Record<string, number>;
  content?: string;
  rows?: readonly Readonly<{
    locator: Record<string, number>;
    cells: readonly Readonly<{
      locator: Record<string, number>;
      content: string;
      colSpan: number;
      rowSpan: number;
    }>[];
  }>[];
}>;

const require = createRequire(import.meta.url);
const mammoth = require("mammoth") as Record<string, unknown>;
const mammothUnzip = require("mammoth/lib/unzip") as {
  openZip(input: { buffer: Buffer }): Promise<unknown>;
};
const mammothDocxReader = require("mammoth/lib/docx/docx-reader") as {
  read(
    docxFile: unknown,
    input?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ value: MammothDocument; messages: unknown[] }>;
};

describe("DTP-1C.0 DOCX parser decision spike", () => {
  it("can map Mammoth internal AST to stable paragraph, list, table, row, and cell blocks without emitting HTML", async () => {
    const bytes = makeDocxSpikeFixture({ includeSectionBreak: true });
    validateDocxSpikePreflight(bytes, "docx");

    const document = await readMammothInternalDocument(bytes);
    const blocks = mapDocumentToBlocks(document);

    expect(mammoth).not.toHaveProperty("readDocument");
    expect(JSON.stringify(blocks)).not.toContain("<p");
    expect(blocks).toMatchObject([
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
        locator: { sectionIndex: 1, blockIndex: 5, tableIndex: 1 },
      },
    ]);
    expect(blocks[4]?.rows?.[0]?.cells[0]).toMatchObject({
      locator: { sectionIndex: 1, tableIndex: 1, rowIndex: 1, cellIndex: 1 },
      content: "合并单元格",
      colSpan: 2,
      rowSpan: 1,
    });
    expect(blocks[4]?.rows?.[1]?.cells[0]).toMatchObject({
      content: "跨行",
      colSpan: 1,
      rowSpan: 2,
    });
  });

  it("proves Mammoth does not expose section boundaries required by DTP-1C.0", async () => {
    const document = await readMammothInternalDocument(
      makeDocxSpikeFixture({ includeSectionBreak: true }),
    );

    expect(findElementTypes(document, "section")).toEqual([]);
    expect(findElementTypes(document, "sectPr")).toEqual([]);
    expect(findRawPropertyNames(document, /section|sect/i)).toEqual([]);
  });

  it("fails closed before Mammoth for DOCM, macros, external relationships, unsafe ZIP names, encrypted entries, and corrupt ZIP", () => {
    expect(() => validateDocxSpikePreflight(makeDocxSpikeFixture(), "docm"))
      .toThrowError(/docx_extension/);
    expect(() =>
      validateDocxSpikePreflight(makeDocxSpikeFixture({ extension: "docm" }), "docx"),
    ).toThrowError(/docx_macro_enabled/);
    expect(() =>
      validateDocxSpikePreflight(makeDocxSpikeFixture({ includeMacro: true }), "docx"),
    ).toThrowError(/docx_active_content/);
    expect(() =>
      validateDocxSpikePreflight(makeDocxSpikeFixture({ externalRelationship: true }), "docx"),
    ).toThrowError(/docx_external_relationship/);
    expect(() =>
      validateDocxSpikePreflight(
        makeDocxSpikeFixture({ zipSlipEntryName: "word\\..\\evil.xml" }),
        "docx",
      ),
    ).toThrowError(/zip_entry_name/);
    expect(() =>
      validateDocxSpikePreflight(makeDocxSpikeFixture({ encryptFirstEntry: true }), "docx"),
    ).toThrowError(/zip_encrypted/);
    expect(() => validateDocxSpikePreflight(truncateDocx(makeDocxSpikeFixture()), "docx"))
      .toThrowError(/zip_eocd|zip_cd/);
  });

  it("records the DTP-1C.0 exit decision as rejection of Mammoth for production parsing", () => {
    const packageJson = require("mammoth/package.json") as {
      license: string;
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const dependencyNames = Object.keys(packageJson.dependencies).sort();

    expect(packageJson.license).toBe("BSD-2-Clause");
    expect(dependencyNames).toEqual([
      "@xmldom/xmldom",
      "argparse",
      "base64-js",
      "bluebird",
      "dingbat-to-unicode",
      "jszip",
      "lop",
      "path-is-absolute",
      "underscore",
      "xmlbuilder",
    ]);
    expect(packageJson.scripts).toHaveProperty("prepare");
    expect({
      decision: "REJECT_MAMMOTH_AND_PROPOSE_CONTROLLED_OOXML_PARSER",
      reasons: [
        "public API exposes HTML/Markdown/raw-text conversion, not stable structured DOCX AST",
        "section boundaries are ignored and unavailable for section locators",
        "structured mapping requires undocumented mammoth/lib/* internal modules",
        "package ships a prepare script and jszip-based parser surface",
      ],
    }).toMatchInlineSnapshot(`
      {
        "decision": "REJECT_MAMMOTH_AND_PROPOSE_CONTROLLED_OOXML_PARSER",
        "reasons": [
          "public API exposes HTML/Markdown/raw-text conversion, not stable structured DOCX AST",
          "section boundaries are ignored and unavailable for section locators",
          "structured mapping requires undocumented mammoth/lib/* internal modules",
          "package ships a prepare script and jszip-based parser surface",
        ],
      }
    `);
  });
});

async function readMammothInternalDocument(bytes: Uint8Array): Promise<MammothDocument> {
  const zip = await mammothUnzip.openZip({ buffer: Buffer.from(bytes) });
  const result = await mammothDocxReader.read(
    zip,
    { buffer: Buffer.from(bytes) },
    { externalFileAccess: false },
  );
  return result.value;
}

function mapDocumentToBlocks(document: MammothDocument): SpikeBlock[] {
  let blockIndex = 0;
  let paragraphIndex = 0;
  let tableIndex = 0;
  const blocks: SpikeBlock[] = [];
  for (const child of document.children) {
    if (child.type === "paragraph") {
      paragraphIndex += 1;
      const content = textOf(child);
      if (content.length === 0) {
        continue;
      }
      blockIndex += 1;
      blocks.push({
        kind: child.numbering ? "list_item" : isHeading(child) ? "heading" : "paragraph",
        locator: { sectionIndex: 1, blockIndex, paragraphIndex },
        content,
      });
    } else if (child.type === "table") {
      tableIndex += 1;
      blockIndex += 1;
      blocks.push({
        kind: "table",
        locator: { sectionIndex: 1, blockIndex, tableIndex },
        rows: (child.children ?? []).map((row, rowOffset) => ({
          locator: { sectionIndex: 1, tableIndex, rowIndex: rowOffset + 1 },
          cells: (row.children ?? []).map((cell, cellOffset) => ({
            locator: {
              sectionIndex: 1,
              tableIndex,
              rowIndex: rowOffset + 1,
              cellIndex: cellOffset + 1,
            },
            content: textOf(cell),
            colSpan: cell.colSpan ?? 1,
            rowSpan: cell.rowSpan ?? 1,
          })),
        })),
      });
    }
  }
  return blocks;
}

function isHeading(element: MammothElement): boolean {
  return /^heading\s+\d+$/i.test(element.styleName ?? "");
}

function textOf(element: MammothElement): string {
  if (element.type === "text") {
    return element.value ?? "";
  }
  return (element.children ?? []).map(textOf).join("");
}

function findElementTypes(element: MammothElement | MammothDocument, type: string): string[] {
  const matches = element.type === type ? [element.type] : [];
  for (const child of element.children ?? []) {
    matches.push(...findElementTypes(child, type));
  }
  return matches;
}

function findRawPropertyNames(value: unknown, pattern: RegExp): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const matches: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (pattern.test(key)) {
      matches.push(key);
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        matches.push(...findRawPropertyNames(item, pattern));
      }
    } else if (child !== null && typeof child === "object") {
      matches.push(...findRawPropertyNames(child, pattern));
    }
  }
  return matches;
}

function validateDocxSpikePreflight(bytes: Uint8Array, extension: string): void {
  if (extension !== "docx") {
    throw new Error("docx_extension");
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new Error("docx_magic");
  }
  const entries = parseCentralDirectory(bytes);
  const names = new Set<string>();
  for (const entry of entries) {
    validateZipEntryName(entry.name);
    const key = entry.name.toLowerCase();
    if (names.has(key)) {
      throw new Error("zip_duplicate");
    }
    names.add(key);
    if (entry.encrypted) {
      throw new Error("zip_encrypted");
    }
    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
      throw new Error("zip_method");
    }
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 100) {
      throw new Error("zip_entry_ratio");
    }
    if (
      key.endsWith("/vbaproject.bin") ||
      key.endsWith(".bin") ||
      key.startsWith("word/embeddings/") ||
      key.startsWith("word/activex/") ||
      key.startsWith("word/ctrlprops/")
    ) {
      throw new Error("docx_active_content");
    }
  }
  for (const required of ["[content_types].xml", "_rels/.rels", "word/document.xml"]) {
    if (!names.has(required)) {
      throw new Error("docx_required");
    }
  }
  for (const entry of entries.filter((candidate) => candidate.name.toLowerCase().endsWith(".rels") ||
    candidate.name.toLowerCase() === "[content_types].xml")) {
    const text = readZipEntryText(bytes, entry);
    if (/macroEnabled|vbaProject|activeX|oleObject/i.test(text)) {
      throw new Error("docx_macro_enabled");
    }
    if (/TargetMode\s*=\s*["']External["']/i.test(text) ||
      /Target\s*=\s*["'](?:https?:|file:|ftp:|\\\\|\/\/)/i.test(text)) {
      throw new Error("docx_external_relationship");
    }
  }
}

type CentralDirectoryEntry = Readonly<{
  name: string;
  encrypted: boolean;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}>;

function parseCentralDirectory(bytes: Uint8Array): CentralDirectoryEntry[] {
  const eocdOffset = findEocd(bytes);
  const entryCount = readUInt16(bytes, eocdOffset + 10);
  const centralDirectorySize = readUInt32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUInt32(bytes, eocdOffset + 16);
  if (centralDirectoryOffset + centralDirectorySize !== eocdOffset) {
    throw new Error("zip_cd_bounds");
  }
  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || readUInt32(bytes, offset) !== 0x02014b50) {
      throw new Error("zip_cd_entry");
    }
    const flags = readUInt16(bytes, offset + 8);
    const compressionMethod = readUInt16(bytes, offset + 10);
    const compressedSize = readUInt32(bytes, offset + 20);
    const uncompressedSize = readUInt32(bytes, offset + 24);
    const fileNameLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const localHeaderOffset = readUInt32(bytes, offset + 42);
    const nameOffset = offset + 46;
    const nextOffset = nameOffset + fileNameLength + extraLength + commentLength;
    if (nextOffset > bytes.byteLength) {
      throw new Error("zip_cd_entry");
    }
    entries.push({
      name: Buffer.from(bytes.subarray(nameOffset, nameOffset + fileNameLength)).toString("utf8"),
      encrypted: (flags & 0x0001) !== 0,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nextOffset;
  }
  return entries;
}

function validateZipEntryName(name: string): void {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (
    normalized !== name ||
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("\0") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("zip_entry_name");
  }
}

function readZipEntryText(bytes: Uint8Array, entry: CentralDirectoryEntry): string {
  const localOffset = entry.localHeaderOffset;
  if (readUInt32(bytes, localOffset) !== 0x04034b50) {
    throw new Error("zip_local_header");
  }
  const nameLength = readUInt16(bytes, localOffset + 26);
  const extraLength = readUInt16(bytes, localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  const compressed = bytes.subarray(dataOffset, dataEnd);
  const data = entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
  return data.toString("utf8");
}

function findEocd(bytes: Uint8Array): number {
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUInt32(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("zip_eocd");
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new Error("zip_read_u16");
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new Error("zip_read_u32");
  }
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! * 0x1000000)
  ) >>> 0;
}
