import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const WORKER_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const SOURCE_FILES = [
  "src/handlers/document-capability-options.ts",
  "src/handlers/document-capability-router.ts",
  "src/runtime/parser-execution-boundary.ts",
  "src/runtime/parser-worker-bootstrap.ts",
  "src/runtime/parser-worker-guard.ts",
  "src/pdf/index.ts",
  "src/pdf/pdf-extract-text.ts",
  "src/docx/index.ts",
  "src/docx/docx-ooxml-preflight.ts",
  "src/docx/docx-read.ts",
  "src/xlsx/index.ts",
  "src/xlsx/ooxml-preflight.ts",
  "src/xlsx/xlsx-read.ts",
  "src/pptx/index.ts",
  "src/pptx/pptx-adapter.ts",
  "src/pptx/pptx-write.ts",
  "src/pptx/resource-resolver.ts",
  "src/source/secured-document-source.ts",
];

const FORBIDDEN_PARSER_IMPORTS =
  /\b(from|import)\s*\(?\s*["'](?:mammoth|pdfkit|docx|yauzl|adm-zip|jszip|file-type)/;
const FORBIDDEN_TEST_BACKDOORS = /\bDW_DIAGNOSTIC\b|\b_dw[A-Za-z0-9_]*/;
const APPROVED_PDF_IMPORT =
  /\bimport\s*\(\s*["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\s*\)/;

describe("DTP parser production safety scan", () => {
  it("only allows the approved PDF parser import and no fixture-builder, ZIP parser, or diagnostic backdoor imports", () => {
    for (const relative of SOURCE_FILES) {
      const source = readFileSync(join(WORKER_ROOT, relative), "utf8");
      expect(source, relative).not.toMatch(FORBIDDEN_PARSER_IMPORTS);
      expect(source, relative).not.toMatch(FORBIDDEN_TEST_BACKDOORS);
      if (relative === "src/pdf/pdf-extract-text.ts") {
        expect(source, relative).toMatch(APPROVED_PDF_IMPORT);
      } else {
        expect(source, relative).not.toContain("pdfjs-dist");
      }
      if (relative === "src/xlsx/xlsx-read.ts") {
        expect(source, relative).toContain('from "xlsx"');
      } else {
        expect(source, relative).not.toContain('from "xlsx"');
        expect(source, relative).not.toContain('import("xlsx")');
      }
    }
  });

  it("keeps document-worker dependencies pinned to approved production parsers and evaluation-only DOCX spike package", () => {
    const packageJson = JSON.parse(
      readFileSync(join(WORKER_ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };

    expect(packageJson.dependencies ?? {}).toEqual({
      "pdfjs-dist": "6.2.108",
      "pptxgenjs": "4.0.1",
      "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    });
    expect(packageJson.devDependencies ?? {}).toEqual({
      mammoth: "1.12.0",
    });
  });

  it("records canvas-free pdfjs installation policy in workspace and lockfile", () => {
    const workspaceYaml = readFileSync(
      join(WORKER_ROOT, "..", "..", "pnpm-workspace.yaml"),
      "utf8",
    );
    const lockfile = readFileSync(
      join(WORKER_ROOT, "..", "..", "pnpm-lock.yaml"),
      "utf8",
    );
    const pdfPackageJsonPath = createRequire(import.meta.url).resolve(
      "pdfjs-dist/package.json",
    );

    expect(workspaceYaml).toContain("ignoredOptionalDependencies");
    expect(workspaceYaml).toContain('"@napi-rs/canvas"');
    expect(lockfile).toContain("ignoredOptionalDependencies");
    expect(lockfile).toContain("'@napi-rs/canvas'");
    expect(lockfile).toContain("pdfjs-dist:");
    expect(lockfile).toContain("version: 6.2.108");
    expect(lockfile).toContain("https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz");
    expect(lockfile).toContain(
      "sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==",
    );
    expect(lockfile).toContain("mammoth:");
    expect(lockfile).toContain("version: 1.12.0");
    expect(
      existsSync(
        join(WORKER_ROOT, "..", "..", "node_modules", ".pnpm", "@napi-rs+canvas@1.0.3"),
      ),
    ).toBe(false);
    expect(() =>
      createRequire(pdfPackageJsonPath).resolve("@napi-rs/canvas"),
    ).toThrow();
  });

  it("documents the parser worker guard module denylist in production source", () => {
    const source = readFileSync(
      join(WORKER_ROOT, "src/runtime/parser-worker-guard.ts"),
      "utf8",
    );
    for (const moduleId of [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:http2",
      "node:dns",
      "node:dgram",
      "node:child_process",
      "node:worker_threads",
    ]) {
      expect(source).toContain(moduleId);
    }
  });

  it("runtime parser guard blocks fetch, stdio, shell, network, and nested worker require", async () => {
    const guardUrl = pathToFileURL(
      join(WORKER_ROOT, "dist/runtime/parser-worker-guard.js"),
    ).href;
    const script = `
      import { createRequire } from "node:module";
      import { installParserWorkerGuard } from ${JSON.stringify(guardUrl)};
      installParserWorkerGuard();
      const req = createRequire(import.meta.url);
      let blocked = 0;
      for (const id of ["node:net", "node:child_process", "node:worker_threads"]) {
        try { req(id); } catch { blocked += 1; }
      }
      try { await fetch("http://127.0.0.1:9"); } catch { blocked += 1; }
      try { process.stdout.write("CANARY"); } catch { blocked += 1; }
      try { process.stderr.write("CANARY"); } catch { blocked += 1; }
      process.exit(blocked === 6 ? 0 : 7);
    `;

    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const proc = spawn("node", ["--input-type=module", "--eval", script], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: string[] = [];
      const stderr: string[] = [];
      proc.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
      proc.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
      proc.on("close", (code) => {
        resolve({ code, stdout: stdout.join(""), stderr: stderr.join("") });
      });
    });

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("CANARY");
    expect(result.stderr).not.toContain("CANARY");
  });
});
