export {
  PPTX_WRITE_CAPABILITY_ID,
  computePptxWriteRequestDigest,
  logicalPresentationDigest,
  normalizePptxWriteOptions,
  writePptx,
} from "./pptx-write.js";
export { generatePptxBytes } from "./pptx-adapter.js";
export {
  canonicalizePptxImageUrl,
  detectImageMediaType,
  normalizeImageContentType,
  resolvePptxImageResource,
  validateResolvedResourceIp,
} from "./resource-resolver.js";
export type {
  NormalizedChartElement,
  NormalizedChartSeries,
  NormalizedElement,
  NormalizedImageElement,
  NormalizedPresentation,
  NormalizedShapeElement,
  NormalizedSlide,
  NormalizedTableElement,
  NormalizedTextElement,
  NormalizedTextStyle,
  ResolvedPresentation,
  PptxWriteDependencies,
  PptxWriteDetailCode,
  PptxWriteFaultPoint,
  PptxWriteOutput,
  PptxWriteRequest,
} from "./pptx-write.js";
export type {
  PinnedHttpsRequest,
  PptxImageSafeSourceSummary,
  PptxImageMediaType,
  PptxImageResourceRef,
  PptxResourceFetchResult,
  PptxResourceResolverDependencies,
  PptxResourceResolverLimits,
  ResolvedPptxImageResource,
} from "./resource-resolver.js";
