import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { computeErrorDigest, computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";
import type { PdfExtractTextOptions } from "../handlers/index.js";

type PdfExtractRequest = Readonly<{
  bytes: Uint8Array;
  extension: string;
  limits: DocumentWorkerLimits;
  options: PdfExtractTextOptions;
}>;

type PdfTextPage = Readonly<{
  pageNumber: number;
  text: string;
  rotation: number;
  empty: boolean;
}>;

type PdfExtractOutput = Readonly<{
  format: "pdf";
  pageCount: number;
  pages: readonly PdfTextPage[];
}>;

type PdfJsModule = Readonly<{
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<PdfDocumentProxy>;
  };
  version?: string;
}>;

type PdfDocumentProxy = Readonly<{
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
}>;

type PdfPageProxy = Readonly<{
  rotate: number;
  getTextContent: (params?: Record<string, unknown>) => Promise<{
    items: readonly unknown[];
  }>;
  cleanup?: () => void;
}>;

type TextItemLike = Readonly<{
  str?: unknown;
  hasEOL?: unknown;
}>;

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

export async function extractPdfText(
  request: PdfExtractRequest,
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
      throw new DocumentCapabilityHandlerError(
        "limit_exceeded",
        "PDF selected page count exceeds configured limit",
        computeErrorDigest("limit_exceeded", "pdf_page_count"),
      );
    }
    if (pageStart > pageCount) {
      throw new DocumentCapabilityHandlerError(
        "invalid_format",
        "PDF pageStart is outside the document",
        computeErrorDigest("invalid_format", "pdf_page_range"),
      );
    }

    const pages: PdfTextPage[] = [];
    let outputTextBytes = 0;
    const maxOutputBytes = request.options.maxTextBytes ?? request.limits.maxOutputBytes;
    if (maxOutputBytes > request.limits.maxOutputBytes) {
      throw new DocumentCapabilityHandlerError(
        "limit_exceeded",
        "PDF requested output budget exceeds configured limit",
        computeErrorDigest("limit_exceeded", "pdf_requested_output"),
      );
    }

    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await withSuppressedConsoleWarnings(() =>
        page.getTextContent({ disableNormalization: false }),
      );
      const text = itemsText(textContent.items);
      page.cleanup?.();

      const pageTextBytes = Buffer.byteLength(text, "utf8");
      if (pageTextBytes > maxOutputBytes) {
        throw new DocumentCapabilityHandlerError(
          "limit_exceeded",
          "PDF page text exceeds configured output limit",
          computeErrorDigest("limit_exceeded", "pdf_page_text"),
        );
      }
      outputTextBytes += pageTextBytes;
      if (outputTextBytes > maxOutputBytes) {
        throw new DocumentCapabilityHandlerError(
          "limit_exceeded",
          "PDF text output exceeds configured limit",
          computeErrorDigest("limit_exceeded", "pdf_output"),
        );
      }

      pages.push({
        pageNumber,
        text,
        rotation: page.rotate,
        empty: text.length === 0,
      });
    }

    const output: PdfExtractOutput = {
      format: "pdf",
      pageCount,
      pages,
    };
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: pageCount,
      returnedCount: pages.length,
      truncated: false,
      resultDigest: computeResultDigest(output),
      locators: pages.map((page) => ({ pageNumber: page.pageNumber })),
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

function validatePdfBytes(bytes: Uint8Array, extension: string): void {
  if (extension !== "pdf") {
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      "PDF capability requires a .pdf file",
      computeErrorDigest("invalid_format", "pdf_extension"),
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
    throw new DocumentCapabilityHandlerError(
      "invalid_format",
      "File content is not a PDF",
      computeErrorDigest("invalid_format", "pdf_magic"),
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
  return typeof text === "string" ? sanitizeText(text) : "";
}

function itemsText(items: readonly unknown[]): string {
  let text = "";
  for (const item of items) {
    text += itemText(item);
    if ((item as TextItemLike).hasEOL === true) {
      text += "\n";
    }
  }
  return text.replace(/\n+$/g, "");
}

function sanitizeText(text: string): string {
  let sanitized = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      continue;
    }
    sanitized += text[index];
  }
  return sanitized;
}

function mapPdfError(error: unknown): DocumentCapabilityHandlerError {
  const message = error instanceof Error ? error.message : "Unknown PDF parser error";
  if (/password|encrypted/i.test(message)) {
    return new DocumentCapabilityHandlerError(
      "encrypted",
      "PDF is encrypted",
      computeErrorDigest("encrypted", "pdf_encrypted"),
    );
  }
  if (/Invalid PDF|Missing PDF|XRef|trailer|corrupt|FormatError/i.test(message)) {
    return new DocumentCapabilityHandlerError(
      "corrupt",
      "PDF is corrupt or unsupported",
      computeErrorDigest("corrupt", "pdf_parse"),
    );
  }
  return new DocumentCapabilityHandlerError(
    "internal_failure",
    "An unexpected PDF parser error occurred",
    computeErrorDigest("internal_failure", message),
  );
}
