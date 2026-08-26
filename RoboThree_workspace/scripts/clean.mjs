import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const projectTargets = new Map([
  ["packages/contracts", ["dist", "tsconfig.tsbuildinfo"]],
  ["services/core", ["dist", "tsconfig.tsbuildinfo"]],
  [
    "apps/desktop",
    [
      "dist",
      "tsconfig.tsbuildinfo",
      "tsconfig.node.tsbuildinfo",
      "tsconfig.renderer.tsbuildinfo",
    ],
  ],
  ["services/central-service", ["target"]],
]);

export async function cleanWorkspace({
  root = workspaceRoot,
  requestedProjects = [],
  log = console.log,
} = {}) {
  const resolvedRoot = resolve(root);
  const projects = requestedProjects.length > 0 ? requestedProjects : [...projectTargets.keys()];
  const removed = [];

  for (const project of projects) {
    const targets = projectTargets.get(project);
    if (targets === undefined) {
      throw new Error(`Refusing to clean unknown project: ${project}`);
    }

    const projectRoot = resolve(resolvedRoot, project);
    assertDescendant(resolvedRoot, projectRoot, "project");

    for (const target of targets) {
      const targetPath = resolve(projectRoot, target);
      assertDescendant(projectRoot, targetPath, "generated target");
      await rm(targetPath, { force: true, recursive: true });
      removed.push(relative(resolvedRoot, targetPath));
    }
  }

  log(`Cleaned ${removed.length} generated paths; dependencies, source, docs, and QA evidence were preserved.`);
  return removed;
}

function assertDescendant(parent, child, label) {
  const pathFromParent = relative(parent, child);
  if (pathFromParent === "" || pathFromParent.startsWith("..") || isAbsolute(pathFromParent)) {
    throw new Error(`Refusing to clean ${label} outside its boundary: ${child}`);
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  await cleanWorkspace({ requestedProjects: process.argv.slice(2) });
}
