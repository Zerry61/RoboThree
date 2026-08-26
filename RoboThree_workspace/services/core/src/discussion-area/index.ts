// Public surface for the discussion-area module.
//
// The module is intentionally self-contained: it does not depend on
// the Kernel or Application layers, so it can be wired into future
// Skill/Hook/Command layers without expanding the Monorepo boundary.

export * from "./agent-name-normalizer.js";
export * from "./discussion-entry.js";
export * from "./discussion-file-name.js";
export * from "./discussion-markdown-codec.js";
export * from "./discussion-repository.js";
export * from "./discussion-service.js";
export * from "./discussion-hook.js";
