import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
  "--filter",
  "@robothree/core",
  "build",
], process.env);

const toolchain = await resolveJavaToolchain();
const wrapper = join(
  workspaceRoot,
  "services",
  "central-service",
  process.platform === "win32" ? "mvnw.cmd" : "mvnw",
);
run(wrapper, [
  "-f",
  join(workspaceRoot, "services", "central-service", "pom.xml"),
  "-Dtest=Cgf12cJavaNodeE2e",
  "test",
], {
  ...withJavaToolchainEnvironment(toolchain),
  ROBOTHREE_CGF12C_NODE: process.execPath,
  ROBOTHREE_CGF12C_WORKSPACE_ROOT: workspaceRoot,
});

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: environment,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
