import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SRC_DIR = join(ROOT_DIR, "src");
const TESTS_DIR = join(ROOT_DIR, "tests");

function collectFiles(dir: string, suffixes: readonly string[]): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(full, suffixes));
    } else if (entry.isFile() && suffixes.some((suffix) => full.endsWith(suffix))) {
      result.push(full);
    }
  }
  return result;
}

describe("production safety static scan", () => {
  it("production source has no diagnostic environment or _dw test option markers", () => {
    const violations: string[] = [];
    for (const file of collectFiles(SRC_DIR, [".ts"])) {
      const text = readFileSync(file, "utf8");
      if (/DW_DIAGNOSTIC|_dw[A-Za-z0-9_]*/.test(text)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("tests do not use empty assertions or comments as pass conditions", () => {
    const violations: string[] = [];
    for (const file of collectFiles(TESTS_DIR, [".ts", ".cjs"])) {
      const text = readFileSync(file, "utf8");
      if (/expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/.test(text)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
