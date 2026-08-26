// Document Worker — public API surface
// DTP-1.0: Parser execution foundation. Real parsers remain gated.

export * from "./protocol/index.js";
export * from "./common/index.js";
export * from "./security/index.js";
export * from "./runtime/index.js";
export * from "./source/index.js";
export * from "./handlers/index.js";
export * from "./pdf/index.js";
export * from "./xlsx/index.js";
export * from "./docx/index.js";
export * from "./pptx/index.js";

// The worker entry point is worker.ts — not exported.
// It runs as a standalone child process via `node dist/worker.js`.
