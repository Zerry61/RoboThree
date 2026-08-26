import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectDtp4PackagingAudit } from "./audit-dtp4-packaging.mjs";

const temporaryRoots = [];

describe("DTP-4 packaging audit", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("accepts the frozen Document Tool packaging boundary", async () => {
    const root = await createFixtureWorkspace();

    await expect(collectDtp4PackagingAudit({ workspaceRoot: root })).resolves.toEqual([]);
  });

  it("fails closed on version drift and forbidden canvas payloads", async () => {
    const root = await createFixtureWorkspace({
      rootVersion: "0.0.0-dtp.3b",
      includeCanvas: true,
    });

    const violations = await collectDtp4PackagingAudit({ workspaceRoot: root });

    expect(violations.join("\n")).toContain(
      "package.json: expected version 0.0.0-r2d.3.2",
    );
    expect(violations.join("\n")).toContain("canvas packages are forbidden");
  });
});

async function createFixtureWorkspace({
  rootVersion = "0.0.0-r2d.3.2",
  coreVersion = "0.0.0-r2d.3.2",
  includeCanvas = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "robothree-dtp4-audit-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "services/core"), { recursive: true });
  await mkdir(join(root, "apps/desktop"), { recursive: true });
  await mkdir(join(root, "packages/contracts"), { recursive: true });
  await mkdir(join(root, "services/document-worker/dist"), { recursive: true });
  await mkdir(join(root, "node_modules/.pnpm/pdfjs-dist@6.2.108/node_modules/pdfjs-dist"), { recursive: true });
  await mkdir(join(root, "node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs"), { recursive: true });
  await mkdir(join(root, "node_modules/.pnpm/xlsx@https+++cdn.sheetjs.com+xlsx-0.20.3+xlsx-0.20.3.tgz/node_modules/xlsx"), { recursive: true });
  if (includeCanvas) {
    await mkdir(join(root, "node_modules/.pnpm/@napi-rs+canvas@0.1.0/node_modules/@napi-rs/canvas"), { recursive: true });
  }
  await writeJson(join(root, "package.json"), {
    name: "robothree",
    version: rootVersion,
    scripts: { "audit:dtp4": "node scripts/audit-dtp4-packaging.mjs" },
  });
  await writeJson(join(root, "services/core/package.json"), {
    name: "@robothree/core",
    version: coreVersion,
  });
  await writeJson(join(root, "apps/desktop/package.json"), {
    name: "@robothree/desktop",
    version: "0.0.0-dfe.7a",
  });
  await writeJson(join(root, "packages/contracts/package.json"), {
    name: "@robothree/contracts",
    version: "0.0.0-r2d.3.1",
  });
  await writeJson(join(root, "services/document-worker/package.json"), {
    name: "@robothree/document-worker",
    version: "0.0.0-ptx.1",
    dependencies: {
      "pdfjs-dist": "6.2.108",
      "pptxgenjs": "4.0.1",
      "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    },
    devDependencies: { mammoth: "1.12.0" },
  });
  await writeJson(join(root, "tsconfig.json"), {
    files: [],
    references: [
      { path: "./packages/contracts" },
      { path: "./services/document-worker" },
      { path: "./services/core" },
      { path: "./apps/desktop" },
    ],
  });
  await writeFile(join(root, "pnpm-workspace.yaml"), [
    "packages:",
    "  - \"apps/*\"",
    "  - \"services/*\"",
    "  - \"packages/*\"",
    "",
    "ignoredOptionalDependencies:",
    "  - \"@napi-rs/canvas\"",
    "",
  ].join("\n"));
  await writeFile(join(root, "pnpm-lock.yaml"), [
    "packages:",
    "  pdfjs-dist@6.2.108:",
    "  pptxgenjs@4.0.1:",
    "  xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz:",
    "    resolution: {integrity: sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==, tarball: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz}",
  ].join("\n"));
  await writeFile(join(root, "services/document-worker/dist/worker.js"), "console.log('ready');\n");
  await writeFile(join(root, "node_modules/.pnpm/pdfjs-dist@6.2.108/node_modules/pdfjs-dist/package.json"), "{}\n");
  await writeFile(join(root, "node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/package.json"), "{}\n");
  await writeFile(join(root, "node_modules/.pnpm/xlsx@https+++cdn.sheetjs.com+xlsx-0.20.3+xlsx-0.20.3.tgz/node_modules/xlsx/package.json"), "{}\n");
  return root;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
