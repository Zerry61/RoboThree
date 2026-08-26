import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultWorkspaceRoot = fileURLToPath(new URL("../", import.meta.url));

const excludedDirectories = new Set([
  ".cache",
  ".git",
  ".idea",
  ".next",
  ".robothree-work-cache",
  ".turbo",
  ".vscode",
  "build",
  "coverage",
  "deliverables",
  "dist",
  "node_modules",
  "out",
  "qa-reports",
  "target",
]);

const excludedExactFiles = new Set([
  ".DS_Store",
  ".npmrc",
  "SOURCE-MANIFEST.json",
]);

const excludedSensitiveExtensions = [
  ".db",
  ".jks",
  ".key",
  ".p12",
  ".pem",
  ".pfx",
  ".sqlite",
];

export function shouldIncludeSourcePath(relativePath, { isDirectory = false } = {}) {
  const segments = relativePath.split("/");
  const name = segments.at(-1) ?? "";

  if (isDirectory) {
    return !segments.some((segment) => excludedDirectories.has(segment));
  }

  if (segments.slice(0, -1).some((segment) => excludedDirectories.has(segment))) {
    return false;
  }
  if (excludedExactFiles.has(name) || name.endsWith(".log") || name.endsWith(".tsbuildinfo")) {
    return false;
  }
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return false;
  }
  if (excludedSensitiveExtensions.some((extension) => name.endsWith(extension))) {
    return false;
  }
  if (name.includes(".sqlite-") || name.includes(".db-")) {
    return false;
  }

  return true;
}

export async function createSourcePackage({
  workspaceRoot = defaultWorkspaceRoot,
  outputDirectory,
  now = new Date(),
  log = console.log,
} = {}) {
  const resolvedWorkspaceRoot = await realpath(resolve(workspaceRoot));
  const requestedOutputDirectory = resolve(
    outputDirectory ?? join(resolvedWorkspaceRoot, "..", "deliverables"),
  );
  await mkdir(requestedOutputDirectory, { recursive: true });
  const resolvedOutputDirectory = await realpath(requestedOutputDirectory);
  assertOutsideWorkspace(resolvedWorkspaceRoot, resolvedOutputDirectory);

  const packageJson = JSON.parse(
    await readFile(join(resolvedWorkspaceRoot, "package.json"), "utf8"),
  );
  if (packageJson.name !== "robothree" || typeof packageJson.version !== "string") {
    throw new Error("Refusing to package a directory that is not the RoboThree product workspace.");
  }

  const stagingDirectory = await mkdtemp(join(resolvedOutputDirectory, ".source-staging-"));
  const archiveRootName = "RoboThree_workspace";
  const stagedWorkspace = join(stagingDirectory, archiveRootName);
  const timestamp = now.toISOString().replaceAll(/[-:.]/g, "");
  const suffix = stagingDirectory.slice(-6);
  const archiveName =
    `RoboThree_workspace-source-${sanitizeFilename(packageJson.version)}-${timestamp}-${suffix}.tar.gz`;
  const archivePath = join(resolvedOutputDirectory, archiveName);
  const temporaryArchivePath = join(stagingDirectory, archiveName);

  try {
    await mkdir(stagedWorkspace, { recursive: true });
    const includedFiles = await collectSourceFiles(resolvedWorkspaceRoot);
    const manifestFiles = [];

    for (const relativePath of includedFiles) {
      const sourcePath = join(resolvedWorkspaceRoot, relativePath);
      const destinationPath = join(stagedWorkspace, relativePath);
      const sourceStat = await stat(sourcePath);
      await mkdir(resolve(destinationPath, ".."), { recursive: true });
      await copyFile(sourcePath, destinationPath);
      await chmod(destinationPath, sourceStat.mode & 0o777);
      const destinationStat = await stat(destinationPath);
      manifestFiles.push({
        path: relativePath,
        bytes: destinationStat.size,
        sha256: await sha256File(destinationPath),
      });
    }

    const manifest = {
      schemaVersion: 1,
      project: packageJson.name,
      version: packageJson.version,
      createdAt: now.toISOString(),
      archiveRoot: archiveRootName,
      fileCount: manifestFiles.length,
      sourceBytes: manifestFiles.reduce((total, file) => total + file.bytes, 0),
      excludedCategories: [
        "dependency directories",
        "build and test outputs",
        "transient QA evidence",
        "environment and credential files",
        "runtime databases",
        "editor and operating-system metadata",
      ],
      files: manifestFiles,
      note: "SOURCE-MANIFEST.json describes source files and intentionally excludes itself.",
    };
    await writeFile(
      join(stagedWorkspace, "SOURCE-MANIFEST.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    );

    await createTarGzip({
      archivePath: temporaryArchivePath,
      parentDirectory: stagingDirectory,
      archiveRootName,
    });
    await rename(temporaryArchivePath, archivePath);

    const archiveDigest = await sha256File(archivePath);
    const checksumPath = `${archivePath}.sha256`;
    await writeFile(checksumPath, `${archiveDigest}  ${archiveName}\n`, { flag: "wx" });

    log(
      `Created ${archivePath} (${manifest.fileCount} source files, ${manifest.sourceBytes} bytes before compression).`,
    );
    log(`SHA-256: ${archiveDigest}`);
    return { archivePath, checksumPath, archiveDigest, manifest };
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
}

async function collectSourceFiles(workspaceRoot) {
  const files = [];

  async function visit(relativeDirectory) {
    const absoluteDirectory = join(workspaceRoot, relativeDirectory);
    const directory = await opendir(absoluteDirectory);
    for await (const entry of directory) {
      const relativePath = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        if (shouldIncludeSourcePath(relativePath, { isDirectory: false })) {
          throw new Error(`Refusing to package included symbolic link: ${relativePath}`);
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (shouldIncludeSourcePath(relativePath, { isDirectory: true })) {
          await visit(relativePath);
        }
        continue;
      }
      if (entry.isFile() && shouldIncludeSourcePath(relativePath, { isDirectory: false })) {
        files.push(relativePath);
      }
    }
  }

  await visit("");
  return files.sort();
}

async function sha256File(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function createTarGzip({ archivePath, parentDirectory, archiveRootName }) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "tar",
      ["-czf", archivePath, "-C", parentDirectory, archiveRootName],
      { shell: false, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8192);
    });
    child.on("error", (error) => {
      rejectPromise(
        new Error(`Unable to start tar. Install a tar-compatible archiver and retry: ${error.message}`),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`tar exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function assertOutsideWorkspace(workspaceRoot, outputDirectory) {
  const pathFromWorkspace = relative(workspaceRoot, outputDirectory);
  if (
    pathFromWorkspace === "" ||
    (!pathFromWorkspace.startsWith("..") && !isAbsolute(pathFromWorkspace))
  ) {
    throw new Error("Delivery output must be outside RoboThree_workspace.");
  }
}

function sanitizeFilename(value) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

function parseArguments(args) {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  if (normalizedArgs.length === 0) {
    return {};
  }
  if (normalizedArgs.length === 2 && normalizedArgs[0] === "--output-dir") {
    return { outputDirectory: normalizedArgs[1] };
  }
  throw new Error("Usage: node scripts/package-source.mjs [--output-dir <outside-workspace-path>]");
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  await createSourcePackage(parseArguments(process.argv.slice(2)));
}
