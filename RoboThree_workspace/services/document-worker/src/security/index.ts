export {
  DEFAULT_LIMITS,
  LimitTracker,
  checkDecompressionRatio,
  checkFileSize,
  limitExceededMessage,
} from "./limits.js";

export { PathGuardError, resolveSafePath } from "./path-guard.js";

export {
  FileValidationError,
  detectFormatByMagic,
  isMagicConsistentWithExtension,
  readFileHeader,
  validateOoxmlStructure,
} from "./file-validation.js";

export type {
  FileHeaderReadOptions,
  FileHeaderReadResult,
  MagicDetectionOptions,
  OoxmlValidationResult,
} from "./file-validation.js";
