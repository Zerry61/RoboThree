import { constants } from "node:fs";
import { lstat, open, realpath, stat, unlink, link as defaultLink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve, sep, win32 } from "node:path";

import { computeErrorDigest, computeResultDigest, sha256Digest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";
import { generatePptxBytes } from "./pptx-adapter.js";
import { resolvePptxImageResource } from "./resource-resolver.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";
import type {
  PptxImageMediaType,
  PptxImageResourceRef,
  PptxResourceResolverDependencies,
} from "./resource-resolver.js";

export const PPTX_WRITE_CAPABILITY_ID = "tool.document.pptx.write";

export type PptxWriteRequest = Readonly<{
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  idempotencyKey?: string;
  requestDigest?: string;
  signal: AbortSignal;
  dependencies?: Partial<PptxWriteDependencies>;
}>;

export type PptxWriteOutput = Readonly<{
  format: "pptx";
  relativePath: string;
  sha256: string;
  presentationDigest: string;
  byteSize: number;
  slideCount: number;
  mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  warnings: readonly string[];
}>;

export type PptxWriteDetailCode =
  | "invalid_arguments"
  | "invalid_path"
  | "parent_missing"
  | "path_outside_workspace"
  | "symlink_not_allowed"
  | "target_exists"
  | "unsupported_extension"
  | "unsupported_mode"
  | "unsupported_template"
  | "unsupported_element"
  | "unsupported_shape"
  | "unsupported_chart"
  | "invalid_color"
  | "input_too_large"
  | "output_too_large"
  | "resource_url_invalid"
  | "resource_url_scheme"
  | "resource_url_userinfo"
  | "resource_url_fragment"
  | "resource_url_host"
  | "resource_url_path"
  | "resource_url_too_large"
  | "resource_dns_empty"
  | "resource_ip_blocked"
  | "resource_ip_rebound"
  | "resource_redirect_invalid"
  | "resource_redirect_limit"
  | "resource_http_status"
  | "resource_content_type_unsupported"
  | "resource_magic_unsupported"
  | "resource_magic_mismatch"
  | "resource_too_large"
  | "resource_timeout"
  | "generation_failed"
  | "publish_failed"
  | "cleanup_failed";

export type PptxWriteFaultPoint =
  | "beforeTempCreate"
  | "afterTempCreate"
  | "afterWriteBeforeFsync"
  | "afterFsyncBeforeLink"
  | "duringLink"
  | "afterLinkBeforeParentFsync"
  | "afterParentFsyncBeforeVerify"
  | "afterVerifyBeforeUnlink"
  | "afterUnlink";

export type PptxWriteDependencies = Readonly<{
  link: typeof defaultLink;
  randomName: () => string;
  fault: (point: PptxWriteFaultPoint) => void | Promise<void>;
  resourceResolver: Partial<PptxResourceResolverDependencies>;
}>;

export type NormalizedPresentation = Readonly<{
  title: string;
  layout: "wide" | "standard";
  templateRef: "robothree.default";
  slides: readonly NormalizedSlide[];
}>;

export type NormalizedSlide = Readonly<{
  title: string;
  elements: readonly NormalizedElement[];
}>;

export type NormalizedElement =
  | NormalizedTextElement
  | NormalizedImageElement
  | NormalizedTableElement
  | NormalizedChartElement
  | NormalizedShapeElement;

export type NormalizedTextElement = Readonly<{
  type: "text";
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: NormalizedTextStyle;
}>;

export type NormalizedImageElement = Readonly<{
  type: "image";
  source: PptxImageResourceRef;
  x: number;
  y: number;
  w: number;
  h: number;
  altText: string;
}>;

export type NormalizedTableElement = Readonly<{
  type: "table";
  rows: readonly (readonly string[])[];
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type NormalizedChartElement = Readonly<{
  type: "chart";
  chartType: "bar" | "line" | "pie";
  labels: readonly string[];
  series: readonly NormalizedChartSeries[];
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type NormalizedChartSeries = Readonly<{
  name: string;
  values: readonly number[];
}>;

export type NormalizedShapeElement = Readonly<{
  type: "shape";
  shapeType: "rect" | "ellipse" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: string;
  lineColor: string;
}>;

export type NormalizedTextStyle = Readonly<{
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
}>;

const MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;
const MAX_SLIDES = 40;
const MAX_ELEMENTS_PER_SLIDE = 32;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 12;
const MAX_CHART_SERIES = 12;
const MAX_CHART_POINTS = 50;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_RESOLVE_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;

const DEFAULT_DEPENDENCIES: PptxWriteDependencies = {
  link: defaultLink,
  randomName: () => randomUUID(),
  fault: () => {},
  resourceResolver: {},
};

type NormalizedWriteOptions = Readonly<{
  mode: "create_new";
  presentation: NormalizedPresentation;
  presentationDigest: string;
  warnings: readonly string[];
}>;

type ResolvedElement =
  | NormalizedTextElement
  | (Omit<NormalizedImageElement, "source"> & Readonly<{
      mediaType: PptxImageMediaType;
      bytes: Buffer;
      sha256: string;
    }>)
  | NormalizedTableElement
  | NormalizedChartElement
  | NormalizedShapeElement;

export type ResolvedPresentation = Readonly<{
  title: string;
  layout: "wide" | "standard";
  templateRef: "robothree.default";
  slides: readonly (Readonly<{
    title: string;
    elements: readonly ResolvedElement[];
  }>)[];
}>;

export async function writePptx(
  request: PptxWriteRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...request.dependencies };
  let tempPath: string | null = null;
  let linked = false;

  try {
    throwIfAborted(request.signal);
    const target = await resolveWriteTarget(request.workspaceRoot, request.relativePath);
    const { presentation, presentationDigest, warnings } = normalizePptxWriteOptions(
      request.options,
      request.limits,
    );
    verifyRequestDigest(
      request.idempotencyKey,
      request.requestDigest,
      request.relativePath,
      presentation,
    );
    await failIfTargetExists(target.targetPath);
    throwIfAborted(request.signal);

    const resolved = await resolvePresentationResources(
      presentation,
      request.limits,
      request.signal,
      dependencies.resourceResolver,
    );
    const bytes = await generatePptxBytes(resolved);
    if (bytes.byteLength > maxOutputBytes(request.limits)) {
      throw pptxError(
        "limit_exceeded",
        "Generated PPTX exceeds configured output limit",
        "output_too_large",
      );
    }

    await dependencies.fault("beforeTempCreate");
    tempPath = join(target.parentRealPath, `.robothree-ptx-${dependencies.randomName()}.tmp`);
    const tempHandle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await dependencies.fault("afterTempCreate");
      throwIfAborted(request.signal);
      await tempHandle.writeFile(bytes);
      await dependencies.fault("afterWriteBeforeFsync");
      await tempHandle.sync();
    } finally {
      await tempHandle.close();
    }

    await dependencies.fault("afterFsyncBeforeLink");
    throwIfAborted(request.signal);
    try {
      await dependencies.fault("duringLink");
      await dependencies.link(tempPath, target.targetPath);
      linked = true;
    } catch (error) {
      if (isNodeErrorCode(error, "EEXIST")) {
        throw pptxError("invalid_format", "PPTX target already exists", "target_exists");
      }
      throw pptxError(
        "internal_failure",
        "PPTX no-clobber publish is unavailable",
        "publish_failed",
      );
    }
    await dependencies.fault("afterLinkBeforeParentFsync");
    await fsyncDirectoryIfSupported(target.parentRealPath);
    await dependencies.fault("afterParentFsyncBeforeVerify");

    const published = await readPublishedBytes(target.targetPath, request.limits);
    const sha256 = sha256Digest(published);
    if (sha256 !== sha256Digest(bytes)) {
      throw pptxError("internal_failure", "Published PPTX digest mismatch", "publish_failed");
    }

    const output: PptxWriteOutput = {
      format: "pptx",
      relativePath: target.normalizedRelativePath,
      sha256,
      presentationDigest,
      byteSize: bytes.byteLength,
      slideCount: presentation.slides.length,
      mediaType: MEDIA_TYPE,
      warnings,
    };
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: presentation.slides.length,
      returnedCount: presentation.slides.length,
      truncated: false,
      resultDigest: computeResultDigest(output),
      timingMs: Date.now() - startedAt,
    };
    await dependencies.fault("afterVerifyBeforeUnlink");
    await removeTemp(tempPath);
    tempPath = null;
    await dependencies.fault("afterUnlink");
    return { output, metadata };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      throw error;
    }
    if (request.signal.aborted) {
      throw new DocumentCapabilityHandlerError("cancelled", "Processing was cancelled");
    }
    throw pptxError(
      "internal_failure",
      "PPTX write failed",
      linked ? "publish_failed" : "generation_failed",
    );
  } finally {
    if (tempPath !== null) {
      await removeTemp(tempPath);
    }
  }
}

export function normalizePptxWriteOptions(
  options: Record<string, unknown>,
  limits: DocumentWorkerLimits,
): NormalizedWriteOptions {
  requireOnlyKeys(options, ["presentation", "mode"]);
  const mode = optionalString(options.mode, "mode") ?? "create_new";
  if (mode !== "create_new") {
    throw pptxError("unsupported_feature", "PPTX overwrite is not enabled", "unsupported_mode");
  }
  const presentation = normalizePresentation(requiredObject(options.presentation, "presentation"));
  const presentationDigest = logicalPresentationDigest(presentation);
  const inputBytes = Buffer.byteLength(JSON.stringify(presentation), "utf8");
  if (inputBytes > maxOutputBytes(limits)) {
    throw pptxError("limit_exceeded", "PPTX presentation input exceeds limit", "input_too_large");
  }
  return {
    mode: "create_new",
    presentation,
    presentationDigest,
    warnings: [],
  };
}

export function logicalPresentationDigest(
  presentation: NormalizedPresentation,
): string {
  return sha256Digest(JSON.stringify(presentation, stableStringifyReplacer));
}

export function computePptxWriteRequestDigest(
  idempotencyKey: string,
  relativePath: string,
  presentation: NormalizedPresentation,
): string {
  return sha256Digest(JSON.stringify({
    capabilityId: PPTX_WRITE_CAPABILITY_ID,
    idempotencyKey,
    relativePath,
    presentation,
  }, stableStringifyReplacer));
}

async function resolvePresentationResources(
  presentation: NormalizedPresentation,
  limits: DocumentWorkerLimits,
  signal: AbortSignal,
  resourceResolver: Partial<PptxResourceResolverDependencies>,
): Promise<ResolvedPresentation> {
  const slides = [];
  for (const slide of presentation.slides) {
    const elements: ResolvedElement[] = [];
    for (const element of slide.elements) {
      throwIfAborted(signal);
      if (element.type === "image") {
        const resolved = await resolvePptxImageResource(
          element.source,
          {
            maxImageBytes: maxImageBytes(limits),
            maxRedirects: DEFAULT_MAX_REDIRECTS,
            resolveTimeoutMs: DEFAULT_RESOLVE_TIMEOUT_MS,
          },
          signal,
          resourceResolver,
        );
        elements.push({
          type: "image",
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          altText: element.altText,
          mediaType: resolved.mediaType,
          bytes: resolved.bytes,
          sha256: resolved.sha256,
        });
      } else {
        elements.push(element);
      }
    }
    slides.push({
      title: slide.title,
      elements,
    });
  }
  return {
    title: presentation.title,
    layout: presentation.layout,
    templateRef: presentation.templateRef,
    slides,
  };
}

function normalizePresentation(value: Record<string, unknown>): NormalizedPresentation {
  requireOnlyKeys(value, ["title", "layout", "templateRef", "slides"]);
  const title = normalizeString(requiredString(value.title, "presentation.title"), "presentation.title", 160);
  const layout = optionalString(value.layout, "presentation.layout") ?? "wide";
  if (layout !== "wide" && layout !== "standard") {
    throw pptxError("invalid_format", "Unsupported PPTX layout", "invalid_arguments");
  }
  const templateRef = optionalString(value.templateRef, "presentation.templateRef") ?? "robothree.default";
  if (templateRef !== "robothree.default") {
    throw pptxError("unsupported_feature", "Unsupported PPTX template", "unsupported_template");
  }
  const slidesInput = requiredArray(value.slides, "presentation.slides");
  if (slidesInput.length === 0 || slidesInput.length > MAX_SLIDES) {
    throw pptxError("limit_exceeded", "PPTX slide count exceeds limit", "input_too_large");
  }
  return {
    title,
    layout,
    templateRef,
    slides: slidesInput.map((slide, index) => normalizeSlide(requiredObject(slide, `slides[${index}]`), index)),
  };
}

function normalizeSlide(value: Record<string, unknown>, slideIndex: number): NormalizedSlide {
  requireOnlyKeys(value, ["title", "elements"]);
  const title = normalizeString(requiredString(value.title, `slides[${slideIndex}].title`), `slides[${slideIndex}].title`, 160);
  const elementsInput = requiredArray(value.elements, `slides[${slideIndex}].elements`);
  if (elementsInput.length > MAX_ELEMENTS_PER_SLIDE) {
    throw pptxError("limit_exceeded", "PPTX slide element count exceeds limit", "input_too_large");
  }
  return {
    title,
    elements: elementsInput.map((element, index) =>
      normalizeElement(requiredObject(element, `slides[${slideIndex}].elements[${index}]`), slideIndex, index),
    ),
  };
}

function normalizeElement(
  value: Record<string, unknown>,
  slideIndex: number,
  elementIndex: number,
): NormalizedElement {
  const label = `slides[${slideIndex}].elements[${elementIndex}]`;
  const type = requiredString(value.type, `${label}.type`);
  if (type === "text") {
    requireOnlyKeys(value, ["type", "text", "x", "y", "w", "h", "style"]);
    return {
      type,
      text: normalizeString(requiredString(value.text, `${label}.text`), `${label}.text`, MAX_STRING_BYTES),
      ...normalizeBox(value, label, { x: 0.7, y: 1.0, w: 11.9, h: 1.0 }),
      style: normalizeTextStyle(optionalObject(value.style, `${label}.style`) ?? {}),
    };
  }
  if (type === "image") {
    requireOnlyKeys(value, ["type", "source", "x", "y", "w", "h", "altText"]);
    return {
      type,
      source: normalizeImageSource(requiredObject(value.source, `${label}.source`)),
      ...normalizeBox(value, label, { x: 0.7, y: 1.0, w: 5.8, h: 3.2 }),
      altText: normalizeString(optionalString(value.altText, `${label}.altText`) ?? "", `${label}.altText`, 240),
    };
  }
  if (type === "table") {
    requireOnlyKeys(value, ["type", "rows", "x", "y", "w", "h"]);
    return {
      type,
      rows: normalizeTableRows(requiredArray(value.rows, `${label}.rows`), label),
      ...normalizeBox(value, label, { x: 0.7, y: 1.0, w: 11.9, h: 3.8 }),
    };
  }
  if (type === "chart") {
    requireOnlyKeys(value, ["type", "chartType", "labels", "series", "x", "y", "w", "h"]);
    return {
      type,
      chartType: normalizeChartType(requiredString(value.chartType, `${label}.chartType`)),
      labels: normalizeStringArray(requiredArray(value.labels, `${label}.labels`), `${label}.labels`, MAX_CHART_POINTS),
      series: normalizeChartSeries(requiredArray(value.series, `${label}.series`), label),
      ...normalizeBox(value, label, { x: 0.7, y: 1.0, w: 7.0, h: 4.2 }),
    };
  }
  if (type === "shape") {
    requireOnlyKeys(value, ["type", "shapeType", "x", "y", "w", "h", "fillColor", "lineColor"]);
    return {
      type,
      shapeType: normalizeShapeType(requiredString(value.shapeType, `${label}.shapeType`)),
      ...normalizeBox(value, label, { x: 0.7, y: 1.0, w: 2.0, h: 1.0 }),
      fillColor: normalizeColor(optionalString(value.fillColor, `${label}.fillColor`) ?? "E5E7EB"),
      lineColor: normalizeColor(optionalString(value.lineColor, `${label}.lineColor`) ?? "6B7280"),
    };
  }
  throw pptxError("unsupported_feature", "Unsupported PPTX element type", "unsupported_element");
}

function normalizeImageSource(source: Record<string, unknown>): PptxImageResourceRef {
  const type = requiredString(source.type, "image.source.type");
  if (type === "data") {
    requireOnlyKeys(source, ["type", "mediaType", "dataBase64"]);
    const mediaType = requiredString(source.mediaType, "image.source.mediaType");
    if (mediaType !== "image/png" && mediaType !== "image/jpeg" && mediaType !== "image/webp") {
      throw pptxError("unsupported_feature", "Unsupported image media type", "resource_content_type_unsupported");
    }
    return {
      type,
      mediaType,
      dataBase64: requiredString(source.dataBase64, "image.source.dataBase64"),
    };
  }
  if (type === "url") {
    requireOnlyKeys(source, ["type", "url"]);
    return {
      type,
      url: requiredString(source.url, "image.source.url"),
    };
  }
  throw pptxError("unsupported_feature", "Unsupported image source type", "unsupported_element");
}

function normalizeTableRows(
  rows: readonly unknown[],
  label: string,
): readonly (readonly string[])[] {
  if (rows.length === 0 || rows.length > MAX_TABLE_ROWS) {
    throw pptxError("limit_exceeded", "PPTX table row count exceeds limit", "input_too_large");
  }
  let expectedColumns: number | null = null;
  return rows.map((row, rowIndex) => {
    const cells = requiredArray(row, `${label}.rows[${rowIndex}]`);
    if (cells.length === 0 || cells.length > MAX_TABLE_COLUMNS) {
      throw pptxError("limit_exceeded", "PPTX table column count exceeds limit", "input_too_large");
    }
    if (expectedColumns === null) expectedColumns = cells.length;
    if (cells.length !== expectedColumns) {
      throw pptxError("invalid_format", "PPTX table rows must have consistent columns", "invalid_arguments");
    }
    return normalizeStringArray(cells, `${label}.rows[${rowIndex}]`, MAX_TABLE_COLUMNS);
  });
}

function normalizeChartSeries(
  series: readonly unknown[],
  label: string,
): readonly NormalizedChartSeries[] {
  if (series.length === 0 || series.length > MAX_CHART_SERIES) {
    throw pptxError("limit_exceeded", "PPTX chart series count exceeds limit", "input_too_large");
  }
  return series.map((item, index) => {
    const value = requiredObject(item, `${label}.series[${index}]`);
    requireOnlyKeys(value, ["name", "values"]);
    const values = requiredArray(value.values, `${label}.series[${index}].values`).map((point) =>
      normalizeFiniteNumber(point, `${label}.series[${index}].values`),
    );
    if (values.length === 0 || values.length > MAX_CHART_POINTS) {
      throw pptxError("limit_exceeded", "PPTX chart point count exceeds limit", "input_too_large");
    }
    return {
      name: normalizeString(requiredString(value.name, `${label}.series[${index}].name`), `${label}.series[${index}].name`, 80),
      values,
    };
  });
}

function normalizeStringArray(
  values: readonly unknown[],
  label: string,
  maxItems: number,
): readonly string[] {
  if (values.length === 0 || values.length > maxItems) {
    throw pptxError("limit_exceeded", "PPTX array exceeds limit", "input_too_large");
  }
  return values.map((value, index) =>
    normalizeString(requiredString(value, `${label}[${index}]`), `${label}[${index}]`, MAX_STRING_BYTES),
  );
}

function normalizeTextStyle(value: Record<string, unknown>): NormalizedTextStyle {
  requireOnlyKeys(value, ["fontSize", "color", "bold", "italic", "align"]);
  const align = optionalString(value.align, "style.align") ?? "left";
  if (align !== "left" && align !== "center" && align !== "right") {
    throw pptxError("invalid_format", "Unsupported text alignment", "invalid_arguments");
  }
  return {
    fontSize: normalizeBoundedNumber(value.fontSize, "style.fontSize", 8, 48, 14),
    color: normalizeColor(optionalString(value.color, "style.color") ?? "111827"),
    bold: optionalBoolean(value.bold, "style.bold") ?? false,
    italic: optionalBoolean(value.italic, "style.italic") ?? false,
    align,
  };
}

function normalizeBox(
  value: Record<string, unknown>,
  label: string,
  defaults: Readonly<{ x: number; y: number; w: number; h: number }>,
): Readonly<{ x: number; y: number; w: number; h: number }> {
  return {
    x: normalizeBoundedNumber(value.x, `${label}.x`, 0, 13.33, defaults.x),
    y: normalizeBoundedNumber(value.y, `${label}.y`, 0, 7.5, defaults.y),
    w: normalizeBoundedNumber(value.w, `${label}.w`, 0.1, 13.33, defaults.w),
    h: normalizeBoundedNumber(value.h, `${label}.h`, 0.1, 7.5, defaults.h),
  };
}

function normalizeChartType(value: string): "bar" | "line" | "pie" {
  if (value === "bar" || value === "line" || value === "pie") return value;
  throw pptxError("unsupported_feature", "Unsupported chart type", "unsupported_chart");
}

function normalizeShapeType(value: string): "rect" | "ellipse" | "line" {
  if (value === "rect" || value === "ellipse" || value === "line") return value;
  throw pptxError("unsupported_feature", "Unsupported shape type", "unsupported_shape");
}

function normalizeColor(value: string): string {
  const normalized = value.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) {
    throw pptxError("invalid_format", "Invalid color value", "invalid_color");
  }
  return normalized;
}

async function resolveWriteTarget(
  workspaceRoot: string,
  relativePath: string,
): Promise<{
  rootRealPath: string;
  parentRealPath: string;
  targetPath: string;
  normalizedRelativePath: string;
}> {
  validateRelativePath(relativePath);
  if (!relativePath.toLowerCase().endsWith(".pptx")) {
    throw pptxError("unsupported_feature", "Only .pptx output is supported", "unsupported_extension");
  }

  const rootRealPath = await realpath(workspaceRoot).catch(() => {
    throw pptxError("invalid_format", "Workspace is unavailable", "path_outside_workspace");
  });
  const parentLexical = resolve(rootRealPath, dirname(relativePath));
  if (!isContained(rootRealPath, parentLexical)) {
    throw pptxError("invalid_format", "PPTX target escapes workspace", "path_outside_workspace");
  }
  const parentRealPath = await realpath(parentLexical).catch(() => {
    throw pptxError("invalid_format", "PPTX target parent does not exist", "parent_missing");
  });
  if (!isContained(rootRealPath, parentRealPath)) {
    throw pptxError("invalid_format", "PPTX target parent escapes workspace", "path_outside_workspace");
  }
  const parentStat = await stat(parentRealPath).catch(() => {
    throw pptxError("invalid_format", "PPTX target parent does not exist", "parent_missing");
  });
  if (!parentStat.isDirectory()) {
    throw pptxError("invalid_format", "PPTX target parent is not a directory", "parent_missing");
  }
  const targetPath = join(parentRealPath, basename(relativePath));
  if (!isContained(rootRealPath, targetPath)) {
    throw pptxError("invalid_format", "PPTX target escapes workspace", "path_outside_workspace");
  }
  return {
    rootRealPath,
    parentRealPath,
    targetPath,
    normalizedRelativePath: relativePath,
  };
}

function validateRelativePath(relativePath: string): void {
  if (relativePath.length === 0 || relativePath.length > 1024) {
    throw pptxError("invalid_format", "Invalid PPTX target path", "invalid_path");
  }
  if (
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith("\\\\") ||
    relativePath.includes("://")
  ) {
    throw pptxError("invalid_format", "Invalid PPTX target path", "invalid_path");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw pptxError("invalid_format", "Invalid PPTX target path", "invalid_path");
  }
}

async function failIfTargetExists(targetPath: string): Promise<void> {
  try {
    const existing = await lstat(targetPath);
    if (existing.isSymbolicLink()) {
      throw pptxError("invalid_format", "PPTX target is a symlink", "symlink_not_allowed");
    }
    throw pptxError("invalid_format", "PPTX target already exists", "target_exists");
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw pptxError("internal_failure", "Unable to inspect PPTX target", "publish_failed");
  }
}

async function readPublishedBytes(path: string, limits: DocumentWorkerLimits): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw pptxError("internal_failure", "Published PPTX is not a file", "publish_failed");
    }
    if (stats.size > maxOutputBytes(limits)) {
      throw pptxError("limit_exceeded", "Published PPTX exceeds output limit", "output_too_large");
    }
    return Buffer.from(await handle.readFile());
  } finally {
    await handle.close();
  }
}

async function fsyncDirectoryIfSupported(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // Directory fsync is not consistently supported across platforms.
  } finally {
    await handle?.close();
  }
}

async function removeTemp(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) {
      throw pptxError("internal_failure", "Unable to clean PPTX temp file", "cleanup_failed");
    }
  }
}

function verifyRequestDigest(
  idempotencyKey: string | undefined,
  requestDigest: string | undefined,
  relativePath: string,
  presentation: NormalizedPresentation,
): void {
  if (idempotencyKey === undefined && requestDigest === undefined) return;
  if (idempotencyKey === undefined || requestDigest === undefined) {
    throw pptxError("invalid_format", "PPTX idempotency material is incomplete", "invalid_arguments");
  }
  const expected = computePptxWriteRequestDigest(idempotencyKey, relativePath, presentation);
  if (expected !== requestDigest) {
    throw pptxError("invalid_format", "PPTX request digest mismatch", "invalid_arguments");
  }
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw pptxError("invalid_format", `${field} must be an object`, "invalid_arguments");
  }
  return value as Record<string, unknown>;
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  return requiredObject(value, field);
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw pptxError("invalid_format", `${field} must be an array`, "invalid_arguments");
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw pptxError("invalid_format", `${field} must be a string`, "invalid_arguments");
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw pptxError("invalid_format", `${field} must be a boolean`, "invalid_arguments");
  }
  return value;
}

function normalizeString(value: string, field: string, maxBytes: number): string {
  const normalized = value.normalize("NFC");
  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw pptxError("limit_exceeded", `${field} exceeds byte limit`, "input_too_large");
  }
  return normalized;
}

function normalizeFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw pptxError("invalid_format", `${field} must be a finite number`, "invalid_arguments");
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeBoundedNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  defaultValue: number,
): number {
  if (value === undefined || value === null) return defaultValue;
  const number = normalizeFiniteNumber(value, field);
  if (number < min || number > max) {
    throw pptxError("invalid_format", `${field} is outside allowed bounds`, "invalid_arguments");
  }
  return number;
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) {
    throw pptxError("invalid_format", `Unsupported PPTX option keys: ${extra.join(", ")}`, "invalid_arguments");
  }
}

function maxImageBytes(limits: DocumentWorkerLimits): number {
  return Math.min(limits.maxFileBytes, MAX_IMAGE_BYTES);
}

function maxOutputBytes(limits: DocumentWorkerLimits): number {
  return Math.min(limits.maxOutputBytes, MAX_OUTPUT_BYTES);
}

function isContained(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DocumentCapabilityHandlerError("cancelled", "PPTX write was cancelled");
  }
}

function pptxError(
  code: ConstructorParameters<typeof DocumentCapabilityHandlerError>[0],
  message: string,
  detailCode: PptxWriteDetailCode,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, message, { detailCode, capabilityId: PPTX_WRITE_CAPABILITY_ID }),
    detailCode,
  );
}

function stableStringifyReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
