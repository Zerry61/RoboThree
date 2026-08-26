/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Preload guard: intercept network built-in modules.
// Must be CommonJS (--require only supports CJS).
// Loaded via `node --require=./network-guard.cjs worker.js`.
// If ANY network module is imported, the process throws immediately.

const Module = require("node:module");
const originalLoad = Module._load;

const BLOCKED = new Set([
  "net",
  "node:net",
  "tls",
  "node:tls",
  "http",
  "node:http",
  "https",
  "node:https",
  "http2",
  "node:http2",
  "dns",
  "node:dns",
  "dgram",
  "node:dgram",
]);

if (typeof originalLoad === "function") {
  Module._load = function (id, parent, isMain) {
    if (BLOCKED.has(id)) {
      throw new Error(`NETWORK_VIOLATION: attempted to load ${id}`);
    }
    return originalLoad.call(this, id, parent, isMain);
  };
}
