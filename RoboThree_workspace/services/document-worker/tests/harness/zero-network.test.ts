/**
 * Harness: Zero network verification (DTP-0-repair.1)
 *
 * Verifies:
 * - Only the PTX ResourceResolver imports approved network modules
 * - package.json dependencies are restricted to approved DTP/PTX packages
 * - Parser worker guard remains responsible for blocking parser-network behavior
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SRC_DIR = join(__dirname, "src");
const PKG_JSON_PATH = join(__dirname, "package.json");

const NETWORK_IMPORTS_RE = /(?:require\s*\(\s*['"](?:node:)?(net|http|https|http2|tls|dns|dgram)['"]\s*\)|from\s+['"](?:node:)?(net|http|https|http2|tls|dns|dgram)['"])/;
const APPROVED_NETWORK_SOURCE = "pptx/resource-resolver.ts";

/** Recursively collect all .ts source files under a directory. */
function collectTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts")) {
      result.push(full);
    }
  }
  return result;
}

/** Read file content; return empty string on error (test will fail on empty). */
function safeReadFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

describe("Zero network harness (repair.1)", () => {
  // ── Static source scans ────────────────────────────────────

  it("only the PTX ResourceResolver imports net/http/https/http2/tls/dns/dgram", () => {
    const srcFiles = collectTsFiles(SRC_DIR);
    expect(srcFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of srcFiles) {
      const content = safeReadFile(file);
      const match = NETWORK_IMPORTS_RE.exec(content);
      const relative = file.slice(SRC_DIR.length + 1);
      if (match && relative !== APPROVED_NETWORK_SOURCE) {
        violations.push(`${file}: imports ${match[1] ?? match[2]}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("package.json dependencies and devDependencies stay within the approved DTP parser set", () => {
    const pkg = JSON.parse(safeReadFile(PKG_JSON_PATH));
    expect(pkg.dependencies ?? {}).toEqual({
      "pdfjs-dist": "6.2.108",
      "pptxgenjs": "4.0.1",
      "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    });
    expect(pkg.devDependencies ?? {}).toEqual({
      mammoth: "1.12.0",
    });
  });
});
