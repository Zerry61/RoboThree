import { opendir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultWorkspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const rootVersion = "0.0.0-mvp.wte.1";
const contractsVersion = "0.0.0-mvp.rsl.2";
const coreVersion = "0.0.0-mvp.wte.1";
const desktopVersion = "0.0.0-mvp.wte.1-repair.1";
const documentWorkerVersion = "0.0.0-mvp.wte.1";
const maxDocumentWorkerDistBytes = 2 * 1024 * 1024;
const maxDocumentWorkerDistFiles = 200;
const maxPdfjsBytes = 40 * 1024 * 1024;
const maxPptxgenBytes = 5 * 1024 * 1024;
const maxXlsxBytes = 10 * 1024 * 1024;

export async function collectDtp4PackagingAudit({
  workspaceRoot = defaultWorkspaceRoot,
} = {}) {
  const root = resolve(workspaceRoot);
  const violations = [];

  await requirePackage(root, "package.json", {
    name: "robothree",
    version: rootVersion,
    scripts: ["audit:dtp4"],
  }, violations);
  await requirePackage(root, "packages/contracts/package.json", {
    name: "@robothree/contracts",
    version: contractsVersion,
  }, violations);
  await requirePackage(root, "services/core/package.json", {
    name: "@robothree/core",
    version: coreVersion,
  }, violations);
  await requirePackage(root, "apps/desktop/package.json", {
    name: "@robothree/desktop",
    version: desktopVersion,
  }, violations);
  await requirePackage(root, "services/document-worker/package.json", {
    name: "@robothree/document-worker",
    version: documentWorkerVersion,
    dependencies: {
      "pdfjs-dist": "6.2.108",
      "pptxgenjs": "4.0.1",
      "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    },
    devDependencies: {
      "mammoth": "1.12.0",
    },
  }, violations);

  await auditRootTsconfig(root, violations);
  await auditWorkspacePolicy(root, violations);
  await auditLockfile(root, violations);
  await auditDocumentWorkerDist(root, violations);
  await auditInstalledParserFootprint(root, violations);

  return violations;
}

export async function runDtp4PackagingAudit(options = {}) {
  const violations = await collectDtp4PackagingAudit(options);
  if (violations.length > 0) {
    throw new Error(`DTP-4 packaging audit failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  }
  return violations;
}

async function requirePackage(root, relativePath, expectation, violations) {
  const packageJson = await readJson(join(root, relativePath), violations);
  if (packageJson === undefined) return;
  if (packageJson.name !== expectation.name) {
    violations.push(`${relativePath}: expected package name ${expectation.name}`);
  }
  if (packageJson.version !== expectation.version) {
    violations.push(`${relativePath}: expected version ${expectation.version}`);
  }
  for (const script of expectation.scripts ?? []) {
    if (typeof packageJson.scripts?.[script] !== "string") {
      violations.push(`${relativePath}: missing script ${script}`);
    }
  }
  for (const [name, version] of Object.entries(expectation.dependencies ?? {})) {
    if (packageJson.dependencies?.[name] !== version) {
      violations.push(`${relativePath}: dependency ${name} must stay pinned to ${version}`);
    }
  }
  for (const [name, version] of Object.entries(expectation.devDependencies ?? {})) {
    if (packageJson.devDependencies?.[name] !== version) {
      violations.push(`${relativePath}: devDependency ${name} must stay pinned to ${version}`);
    }
  }
}

async function auditRootTsconfig(root, violations) {
  const tsconfig = await readJson(join(root, "tsconfig.json"), violations);
  if (tsconfig === undefined) return;
  const references = Array.isArray(tsconfig.references)
    ? tsconfig.references.map((item) => item?.path).filter((item) => typeof item === "string")
    : [];
  const expected = [
    "./packages/contracts",
    "./services/document-worker",
    "./services/core",
    "./apps/desktop",
  ];
  if (JSON.stringify(references) !== JSON.stringify(expected)) {
    violations.push("tsconfig.json: root project references must remain contracts/document-worker/core/desktop");
  }
}

async function auditWorkspacePolicy(root, violations) {
  const source = await readText(join(root, "pnpm-workspace.yaml"), violations);
  if (source === undefined) return;
  if (!source.includes("- \"@napi-rs/canvas\"")) {
    violations.push("pnpm-workspace.yaml: @napi-rs/canvas must remain ignored");
  }
}

async function auditLockfile(root, violations) {
  const source = await readText(join(root, "pnpm-lock.yaml"), violations);
  if (source === undefined) return;
  for (const required of [
    "pdfjs-dist@6.2.108",
    "pptxgenjs@4.0.1",
    "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    "sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==",
  ]) {
    if (!source.includes(required)) {
      violations.push(`pnpm-lock.yaml: missing pinned parser supply-chain evidence ${required}`);
    }
  }
}

async function auditDocumentWorkerDist(root, violations) {
  const distRoot = join(root, "services/document-worker/dist");
  const entry = join(distRoot, "worker.js");
  const entryStats = await stat(entry).catch(() => undefined);
  if (entryStats === undefined || !entryStats.isFile()) {
    violations.push("services/document-worker/dist/worker.js: build artifact is required for packaged runtime");
    return;
  }
  const summary = await summarizeDirectory(distRoot);
  if (summary.bytes > maxDocumentWorkerDistBytes) {
    violations.push(
      `services/document-worker/dist: ${summary.bytes} bytes exceeds ${maxDocumentWorkerDistBytes} byte budget`,
    );
  }
  if (summary.files > maxDocumentWorkerDistFiles) {
    violations.push(
      `services/document-worker/dist: ${summary.files} files exceeds ${maxDocumentWorkerDistFiles} file budget`,
    );
  }
}

async function auditInstalledParserFootprint(root, violations) {
  const pnpmRoot = join(root, "node_modules/.pnpm");
  const entries = await listDirectoryNames(pnpmRoot).catch(() => []);
  const pdfjs = entries.filter((entry) => entry.startsWith("pdfjs-dist@6.2.108"));
  const pptxgenjs = entries.filter((entry) => entry.startsWith("pptxgenjs@4.0.1"));
  const xlsx = entries.filter((entry) => entry.startsWith("xlsx@https+++cdn.sheetjs.com+xlsx-0.20.3+"));
  if (pdfjs.length !== 1) {
    violations.push("node_modules/.pnpm: expected exactly one installed pdfjs-dist@6.2.108 package");
  } else {
    await enforceDirectoryBudget(root, join(pnpmRoot, pdfjs[0]), maxPdfjsBytes, violations);
  }
  if (pptxgenjs.length !== 1) {
    violations.push("node_modules/.pnpm: expected exactly one installed pptxgenjs@4.0.1 package");
  } else {
    await enforceDirectoryBudget(root, join(pnpmRoot, pptxgenjs[0]), maxPptxgenBytes, violations);
  }
  if (xlsx.length !== 1) {
    violations.push("node_modules/.pnpm: expected exactly one installed SheetJS CDN package");
  } else {
    await enforceDirectoryBudget(root, join(pnpmRoot, xlsx[0]), maxXlsxBytes, violations);
  }
  const canvas = entries.filter((entry) =>
    entry.includes("canvas") || entry.includes("@napi-rs+canvas"));
  if (canvas.length > 0) {
    violations.push(`node_modules/.pnpm: canvas packages are forbidden (${canvas.join(", ")})`);
  }
}

async function enforceDirectoryBudget(root, path, maxBytes, violations) {
  const summary = await summarizeDirectory(path);
  if (summary.bytes > maxBytes) {
    violations.push(`${relative(root, path)}: ${summary.bytes} bytes exceeds ${maxBytes} byte budget`);
  }
}

async function summarizeDirectory(root) {
  let bytes = 0;
  let files = 0;
  async function visit(directory) {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const item = await stat(path);
        bytes += item.size;
        files += 1;
      }
    }
  }
  await visit(root);
  return { bytes, files };
}

async function listDirectoryNames(path) {
  const names = [];
  const handle = await opendir(path);
  for await (const entry of handle) {
    if (entry.isDirectory()) names.push(entry.name);
  }
  return names.sort();
}

async function readJson(path, violations) {
  const source = await readText(path, violations);
  if (source === undefined) return undefined;
  try {
    return JSON.parse(source);
  } catch (error) {
    violations.push(`${path}: invalid JSON (${error instanceof Error ? error.message : "unknown parse error"})`);
    return undefined;
  }
}

async function readText(path, violations) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    violations.push(`${path}: unable to read (${error instanceof Error ? error.message : "unknown read error"})`);
    return undefined;
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  await runDtp4PackagingAudit();
  console.log("DTP-4 packaging audit passed.");
}
