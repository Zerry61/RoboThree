import { inflateRawSync } from "node:zlib";

import { computeErrorDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type { DocumentWorkerLimits } from "../protocol/index.js";

export type DocxOoxmlEntry = Readonly<{
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}>;

export type DocxOoxmlPreflightResult = Readonly<{
  entries: readonly DocxOoxmlEntry[];
  entryCount: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
}>;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH_BYTES = 65_557;
const MAX_ENTRY_NAME_BYTES = 512;
const MAX_XML_ENTRY_BYTES = 1_000_000;
const MAX_INSPECTED_XML_BYTES = 5_000_000;
const MAX_ENTRIES = 10_000;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

export function validateDocxOoxmlPreflight(
  bytes: Uint8Array,
  extension: string,
  limits: DocumentWorkerLimits,
): DocxOoxmlPreflightResult {
  validateZipMagic(bytes, extension);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const eocd = parseEndOfCentralDirectory(bytes, eocdOffset);
  const entries = parseCentralDirectory(bytes, eocd);
  validatePackageStructure(bytes, entries, limits, bytes.byteLength);
  return summarize(entries);
}

export function readDocxXmlEntry(
  bytes: Uint8Array,
  entries: readonly DocxOoxmlEntry[],
  name: string,
): string | null {
  const entry = entries.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  return entry === undefined ? null : readXmlEntry(bytes, entry);
}

function validateZipMagic(bytes: Uint8Array, extension: string): void {
  if (extension !== "docx") {
    throw typedError("invalid_format", "DOCX capability requires a .docx file", "docx_extension");
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw typedError("invalid_format", "File content is not a DOCX ZIP package", "docx_magic");
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH_BYTES);
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUInt32LE(bytes, offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw typedError("corrupt", "DOCX ZIP central directory is missing", "zip_eocd");
}

type EndOfCentralDirectory = Readonly<{
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
}>;

function parseEndOfCentralDirectory(
  bytes: Uint8Array,
  offset: number,
): EndOfCentralDirectory {
  const diskNumber = readUInt16LE(bytes, offset + 4);
  const centralDirectoryDisk = readUInt16LE(bytes, offset + 6);
  const entriesOnDisk = readUInt16LE(bytes, offset + 8);
  const entryCount = readUInt16LE(bytes, offset + 10);
  const centralDirectorySize = readUInt32LE(bytes, offset + 12);
  const centralDirectoryOffset = readUInt32LE(bytes, offset + 16);
  const commentLength = readUInt16LE(bytes, offset + 20);

  if (offset + 22 + commentLength !== bytes.byteLength) {
    throw typedError("corrupt", "DOCX ZIP EOCD comment length is invalid", "zip_eocd_comment");
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw typedError("unsupported_feature", "DOCX ZIP multi-disk archives are not supported", "zip_multidisk");
  }
  if (
    entryCount === 0 ||
    entryCount > MAX_ENTRIES ||
    entryCount === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw typedError("limit_exceeded", "DOCX ZIP entry count or ZIP64 metadata is unsupported", "zip_entries");
  }
  if (
    centralDirectoryOffset < 4 ||
    centralDirectorySize < 1 ||
    centralDirectoryOffset + centralDirectorySize !== offset ||
    centralDirectoryOffset + centralDirectorySize > bytes.byteLength
  ) {
    throw typedError("corrupt", "DOCX ZIP central directory bounds are invalid", "zip_cd_bounds");
  }

  return {
    centralDirectoryOffset,
    centralDirectorySize,
    entryCount,
  };
}

function parseCentralDirectory(
  bytes: Uint8Array,
  eocd: EndOfCentralDirectory,
): DocxOoxmlEntry[] {
  const entries: DocxOoxmlEntry[] = [];
  let offset = eocd.centralDirectoryOffset;
  for (let index = 0; index < eocd.entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength ||
      readUInt32LE(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw typedError("corrupt", "DOCX ZIP central directory entry is invalid", "zip_cd_entry");
    }
    const flags = readUInt16LE(bytes, offset + 8);
    const compressionMethod = readUInt16LE(bytes, offset + 10);
    const compressedSize = readUInt32LE(bytes, offset + 20);
    const uncompressedSize = readUInt32LE(bytes, offset + 24);
    const fileNameLength = readUInt16LE(bytes, offset + 28);
    const extraLength = readUInt16LE(bytes, offset + 30);
    const commentLength = readUInt16LE(bytes, offset + 32);
    const localHeaderOffset = readUInt32LE(bytes, offset + 42);
    const nameOffset = offset + 46;
    const nextOffset = nameOffset + fileNameLength + extraLength + commentLength;

    if (nextOffset > bytes.byteLength || fileNameLength < 1 ||
      fileNameLength > MAX_ENTRY_NAME_BYTES) {
      throw typedError("corrupt", "DOCX ZIP entry name bounds are invalid", "zip_name_bounds");
    }
    if ((flags & 0x0001) !== 0) {
      throw typedError("encrypted", "DOCX ZIP contains encrypted entries", "zip_encrypted");
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw typedError("unsupported_feature", "DOCX ZIP compression method is unsupported", "zip_method");
    }
    if (
      compressedSize === ZIP64_SENTINEL_32 ||
      uncompressedSize === ZIP64_SENTINEL_32 ||
      localHeaderOffset === ZIP64_SENTINEL_32
    ) {
      throw typedError("limit_exceeded", "DOCX ZIP64 entries are not supported", "zip64_entry");
    }
    if (localHeaderOffset + 4 > bytes.byteLength ||
      readUInt32LE(bytes, localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw typedError("corrupt", "DOCX ZIP local header offset is invalid", "zip_local_header");
    }

    const name = Buffer.from(bytes.subarray(nameOffset, nameOffset + fileNameLength)).toString("utf8");
    validateEntryName(name);
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    });
    offset = nextOffset;
  }
  if (offset !== eocd.centralDirectoryOffset + eocd.centralDirectorySize) {
    throw typedError("corrupt", "DOCX ZIP central directory size does not match entries", "zip_cd_size");
  }
  return entries;
}

function validatePackageStructure(
  bytes: Uint8Array,
  entries: readonly DocxOoxmlEntry[],
  limits: DocumentWorkerLimits,
  fileBytes: number,
): void {
  const names = new Set<string>();
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (names.has(key)) {
      throw typedError("invalid_format", "DOCX ZIP contains duplicate or conflicting entries", "zip_duplicate");
    }
    names.add(key);
    totalUncompressedBytes += entry.uncompressedSize;
    if (entry.compressedSize === 0 && entry.uncompressedSize > 0) {
      throw typedError("limit_exceeded", "DOCX ZIP entry has invalid compression ratio", "zip_entry_ratio");
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > limits.maxDecompressionRatio
    ) {
      throw typedError("limit_exceeded", "DOCX ZIP entry exceeds decompression ratio", "zip_entry_ratio");
    }
  }
  if (totalUncompressedBytes > fileBytes * limits.maxDecompressionRatio) {
    throw typedError("limit_exceeded", "DOCX ZIP package exceeds decompression budget", "zip_total_ratio");
  }
  for (const required of [
    "[content_types].xml",
    "_rels/.rels",
    "word/document.xml",
  ]) {
    if (!names.has(required)) {
      throw typedError("invalid_format", "DOCX OOXML package is missing required entries", "docx_required");
    }
  }
  for (const name of names) {
    if (
      name.endsWith("/vbaproject.bin") ||
      name.endsWith(".bin") ||
      name.startsWith("word/embeddings/") ||
      name.startsWith("word/activex/") ||
      name.startsWith("word/ctrlprops/") ||
      name.startsWith("word/external") ||
      name.startsWith("customxml/")
    ) {
      throw typedError("unsupported_feature", "DOCX package contains macros or embedded objects", "docx_active_content");
    }
  }
  inspectRequiredXml(bytes, entries);
}

function summarize(
  entries: readonly DocxOoxmlEntry[],
): DocxOoxmlPreflightResult {
  return {
    entryCount: entries.length,
    totalCompressedBytes: entries.reduce((total, entry) => total + entry.compressedSize, 0),
    totalUncompressedBytes: entries.reduce((total, entry) => total + entry.uncompressedSize, 0),
    entries,
  };
}

function validateEntryName(name: string): void {
  const normalized = name.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (
    normalized !== name ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.startsWith("//") ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw typedError("invalid_format", "DOCX ZIP entry name is unsafe", "zip_entry_name");
  }
}

function inspectRequiredXml(
  bytes: Uint8Array,
  entries: readonly DocxOoxmlEntry[],
): void {
  const inspected = entries.filter((entry) =>
    entry.name.toLowerCase() === "[content_types].xml" ||
    entry.name.toLowerCase() === "_rels/.rels" ||
    entry.name.toLowerCase() === "word/_rels/document.xml.rels"
  );
  let inspectedBytes = 0;
  for (const entry of inspected) {
    const text = readXmlEntry(bytes, entry);
    inspectedBytes += Buffer.byteLength(text, "utf8");
    if (inspectedBytes > MAX_INSPECTED_XML_BYTES) {
      throw typedError("limit_exceeded", "DOCX OOXML inspected XML exceeds configured preflight budget", "docx_xml_total");
    }
    if (/TargetMode\s*=\s*["']External["']/i.test(text) ||
      /Target\s*=\s*["'](?:https?:|file:|ftp:|\\\\|\/\/)/i.test(text)) {
      throw typedError("unsupported_feature", "DOCX package contains external relationships", "docx_external_rel");
    }
  }
  const contentTypes = readXmlEntry(
    bytes,
    requiredEntry(entries, "[content_types].xml"),
  );
  if (/<Override\b[^>]+(?:macroEnabled|vbaProject|activeX|oleObject)/i.test(contentTypes)) {
    throw typedError("unsupported_feature", "DOCX package contains macro-enabled or embedded content types", "docx_macro_enabled");
  }
  if (!/word\/document\.xml/i.test(contentTypes) ||
    !/wordprocessingml\.document\.main\+xml/i.test(contentTypes)) {
    throw typedError("invalid_format", "DOCX content types do not declare a main document", "docx_content_types");
  }
}

function requiredEntry(
  entries: readonly DocxOoxmlEntry[],
  name: string,
): DocxOoxmlEntry {
  const entry = entries.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  if (entry === undefined) {
    throw typedError("invalid_format", "DOCX OOXML package is missing required entries", "docx_required");
  }
  return entry;
}

function readXmlEntry(bytes: Uint8Array, entry: DocxOoxmlEntry): string {
  if (entry.uncompressedSize > MAX_XML_ENTRY_BYTES) {
    throw typedError("limit_exceeded", "DOCX OOXML XML entry exceeds configured preflight budget", "docx_xml_entry");
  }
  const localOffset = entry.localHeaderOffset;
  const fileNameLength = readUInt16LE(bytes, localOffset + 26);
  const extraLength = readUInt16LE(bytes, localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataOffset < 0 || dataEnd > bytes.byteLength) {
    throw typedError("corrupt", "DOCX ZIP local entry data bounds are invalid", "zip_local_data");
  }
  const compressed = bytes.subarray(dataOffset, dataEnd);
  const inflated = entry.compressionMethod === 0
    ? Buffer.from(compressed)
    : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
  if (inflated.byteLength !== entry.uncompressedSize) {
    throw typedError("corrupt", "DOCX ZIP XML entry size does not match central directory", "zip_xml_size");
  }
  return inflated.toString("utf8");
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw typedError("corrupt", "DOCX ZIP integer read is out of bounds", "zip_read_u16");
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw typedError("corrupt", "DOCX ZIP integer read is out of bounds", "zip_read_u32");
  }
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! * 0x1000000)
  ) >>> 0;
}

function typedError(
  code: "invalid_format" | "encrypted" | "corrupt" | "limit_exceeded" | "unsupported_feature",
  message: string,
  digestKey: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, digestKey),
  );
}
