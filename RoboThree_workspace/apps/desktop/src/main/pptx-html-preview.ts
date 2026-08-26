import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const MAX_PPTX_PREVIEW_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_PPTX_PREVIEW_HTML_BYTES = 192 * 1024;
const MAX_SLIDES = 40;
const MAX_TEXT_ITEMS_PER_SLIDE = 48;
const MAX_TEXT_CHARS_PER_SLIDE = 2_000;

export type StableFileIdentity = Readonly<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}>;

export type PptxHtmlPreviewResult =
  | Readonly<{ ok: true; value: { html: string; warningCount: number } }>
  | Readonly<{ ok: false; reason: "source_unavailable" | "source_changed" | "too_large" | "unsupported" }>;

type ZipEntry = Readonly<{
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}>;

type PptxSlidePreview = Readonly<{
  index: number;
  title: string;
  texts: readonly string[];
  tableCount: number;
  chartCount: number;
  imageCount: number;
}>;

export async function renderPptxHtmlPreviewFromFile(input: {
  realPath: string;
  expected: StableFileIdentity;
}): Promise<PptxHtmlPreviewResult> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(input.realPath, "r");
    const before = await handle.stat();
    if (!sameStableFile(input.expected, before) || !before.isFile()) {
      return { ok: false, reason: "source_changed" };
    }
    if (before.size > MAX_PPTX_PREVIEW_SOURCE_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.byteLength) return { ok: false, reason: "source_changed" };
    const after = await handle.stat();
    if (!sameStableFile(before, after)) return { ok: false, reason: "source_changed" };
    const preview = renderPptxHtmlPreview(bytes);
    return preview;
  } catch {
    return { ok: false, reason: "source_unavailable" };
  } finally {
    await handle?.close();
  }
}

export function renderPptxHtmlPreview(bytes: Buffer): PptxHtmlPreviewResult {
  try {
    if (bytes.byteLength < 22 || bytes.subarray(0, 2).toString("ascii") !== "PK") {
      return { ok: false, reason: "unsupported" };
    }
    const entries = readZipEntries(bytes);
    if (!entries.has("[Content_Types].xml") || !entries.has("ppt/presentation.xml")) {
      return { ok: false, reason: "unsupported" };
    }
    const slideNames = [...entries.keys()]
      .filter((name) => /^ppt\/slides\/slide[1-9][0-9]*\.xml$/u.test(name))
      .sort((left, right) => slideNumber(left) - slideNumber(right))
      .slice(0, MAX_SLIDES);
    if (slideNames.length === 0) return { ok: false, reason: "unsupported" };
    const slides = slideNames.map((name, index) =>
      previewSlide(index + 1, inflateZipEntry(bytes, entries, name).toString("utf8")));
    const truncated = slideNames.length < [...entries.keys()]
      .filter((name) => /^ppt\/slides\/slide[1-9][0-9]*\.xml$/u.test(name)).length;
    const html = htmlPreviewDocumentFromSlides({ slides, truncated });
    if (new TextEncoder().encode(html).byteLength > MAX_PPTX_PREVIEW_HTML_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    return {
      ok: true,
      value: {
        html,
        warningCount: truncated ? 1 : 0,
      },
    };
  } catch {
    return { ok: false, reason: "unsupported" };
  }
}

function previewSlide(index: number, xml: string): PptxSlidePreview {
  const rawTexts = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)]
    .map((match) => decodeXmlText(match[1] ?? ""))
    .map((text) => text.replace(/\s+/gu, " ").trim())
    .filter((text) => text.length > 0)
    .slice(0, MAX_TEXT_ITEMS_PER_SLIDE);
  let remaining = MAX_TEXT_CHARS_PER_SLIDE;
  const texts: string[] = [];
  for (const text of rawTexts) {
    if (remaining <= 0) break;
    const bounded = Array.from(text).slice(0, remaining).join("");
    texts.push(bounded);
    remaining -= Array.from(bounded).length;
  }
  return Object.freeze({
    index,
    title: texts.at(0) ?? `Slide ${index}`,
    texts,
    tableCount: countMatches(xml, /<a:tbl(?:\s|>)/gu),
    chartCount: countMatches(xml, /<c:chart(?:\s|>)/gu),
    imageCount: countMatches(xml, /<a:blip(?:\s|>)/gu),
  });
}

function htmlPreviewDocumentFromSlides(input: {
  slides: readonly PptxSlidePreview[];
  truncated: boolean;
}): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<title>PPTX Preview</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>PPTX visual preview</h1>",
    "<section class=\"notice\">",
    "This local preview is generated from the PPTX OOXML structure in a sandbox. It is not a PowerPoint renderer, so exact layout may differ.",
    input.truncated ? " Only the first 40 slides are shown." : "",
    "</section>",
    ...input.slides.map(renderSlide),
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function renderSlide(slide: PptxSlidePreview): string {
  const badges = [
    slide.tableCount > 0 ? `${slide.tableCount} table${slide.tableCount === 1 ? "" : "s"}` : undefined,
    slide.chartCount > 0 ? `${slide.chartCount} chart${slide.chartCount === 1 ? "" : "s"}` : undefined,
    slide.imageCount > 0 ? `${slide.imageCount} image${slide.imageCount === 1 ? "" : "s"}` : undefined,
  ].filter((item): item is string => item !== undefined);
  const titleId = `slide-${slide.index}-title`;
  const bodyLines = slide.texts.slice(1, 9)
    .flatMap((text) => wrapText(text, 78))
    .slice(0, 12);
  const badgeLines = badges.length === 0 ? ["text preview"] : badges;
  return [
    "<article class=\"slide\">",
    `<svg role="img" aria-labelledby="${titleId}" viewBox="0 0 960 540" width="960" height="540" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="${titleId}">Slide ${slide.index}: ${escapeHtml(slide.title)}</title>`,
    "<rect x=\"0\" y=\"0\" width=\"960\" height=\"540\" rx=\"14\" fill=\"#ffffff\" stroke=\"#d1d5db\"/>",
    `<text x="36" y="42" font-size="18" fill="#6b7280">Slide ${slide.index}</text>`,
    `<text x="36" y="100" font-size="34" font-weight="700" fill="#111827">${escapeHtml(truncateForSvg(slide.title, 58))}</text>`,
    ...bodyLines.map((line, index) =>
      `<text x="52" y="${154 + index * 30}" font-size="20" fill="#1f2937">${escapeHtml(truncateForSvg(line, 88))}</text>`),
    ...badgeLines.slice(0, 4).map((badge, index) => {
      const y = 458;
      const x = 52 + index * 168;
      return [
        `<rect x="${x}" y="${y}" width="148" height="34" rx="17" fill="#f9fafb" stroke="#d1d5db"/>`,
        `<text x="${x + 16}" y="${y + 22}" font-size="14" fill="#374151">${escapeHtml(truncateForSvg(badge, 18))}</text>`,
      ].join("");
    }),
    "</svg>",
    "</article>",
  ].join("");
}

function wrapText(input: string, maxScalars: number): readonly string[] {
  const words = input.split(/\s+/u).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (Array.from(candidate).length <= maxScalars) {
      current = candidate;
      continue;
    }
    if (current.length > 0) lines.push(current);
    current = Array.from(word).slice(0, maxScalars).join("");
  }
  if (current.length > 0) lines.push(current);
  return lines.length === 0 ? ["No slide text extracted."] : lines;
}

function truncateForSvg(input: string, maxScalars: number): string {
  const scalars = Array.from(input);
  if (scalars.length <= maxScalars) return input;
  return `${scalars.slice(0, Math.max(0, maxScalars - 1)).join("")}…`;
}

function readZipEntries(bytes: Buffer): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocd + 16);
  if (
    centralDirectoryOffset > bytes.byteLength
    || centralDirectorySize > bytes.byteLength
    || centralDirectoryOffset + centralDirectorySize > bytes.byteLength
  ) {
    throw new Error("PPTX ZIP central directory bounds are invalid");
  }
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("PPTX ZIP central directory entry is invalid");
    }
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > end) throw new Error("PPTX ZIP central directory name is invalid");
    const name = bytes.subarray(nameStart, nameEnd).toString("utf8");
    if (isUnsafeZipEntryName(name)) throw new Error("PPTX ZIP entry name is unsafe");
    entries.set(name, {
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  if (offset !== end) throw new Error("PPTX ZIP central directory size mismatch");
  return entries;
}

function inflateZipEntry(
  bytes: Buffer,
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): Buffer {
  const entry = entries.get(name);
  if (entry === undefined) throw new Error(`PPTX ZIP entry is missing: ${name}`);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.byteLength || bytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`PPTX ZIP local header is invalid: ${name}`);
  }
  const fileNameLength = bytes.readUInt16LE(offset + 26);
  const extraLength = bytes.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart > bytes.byteLength || dataEnd > bytes.byteLength) {
    throw new Error(`PPTX ZIP entry data is invalid: ${name}`);
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.compression === 0) return Buffer.from(compressed);
  if (entry.compression === 8) {
    const inflated = inflateRawSync(compressed, {
      maxOutputLength: Math.min(entry.uncompressedSize, 2 * 1024 * 1024),
    });
    if (inflated.byteLength !== entry.uncompressedSize) {
      throw new Error(`PPTX ZIP entry size mismatch: ${name}`);
    }
    return inflated;
  }
  throw new Error(`PPTX ZIP compression is unsupported: ${name}`);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  for (let index = bytes.byteLength - 22; index >= minimumOffset; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("PPTX ZIP EOCD is missing");
}

function isUnsafeZipEntryName(name: string): boolean {
  return name.length === 0
    || name.includes("\0")
    || name.includes("\\")
    || name.startsWith("/")
    || name.startsWith("//")
    || name.includes("://")
    || name.split("/").some((part) => part === "." || part === "..");
}

function slideNumber(name: string): number {
  const match = /slide([1-9][0-9]*)\.xml$/u.exec(name);
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}

function decodeXmlText(input: string): string {
  return input
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function sameStableFile(
  expected: StableFileIdentity,
  actual: StableFileIdentity,
): boolean {
  return expected.dev === actual.dev
    && expected.ino === actual.ino
    && expected.size === actual.size
    && expected.mtimeMs === actual.mtimeMs;
}
