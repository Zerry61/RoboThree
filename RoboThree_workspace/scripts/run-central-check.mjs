import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const supportedArguments = new Set(["--doctor", "--offline"]);
const requestedArguments = process.argv.slice(2);

for (const argument of requestedArguments) {
  if (!supportedArguments.has(argument)) {
    throw new Error(`Unsupported Central check argument: ${argument}`);
  }
}

const toolchain = await resolveJavaToolchain();
const summary = {
  expectedMajor: toolchain.expectedMajor,
  javaHome: toolchain.javaHome,
  javaVersion: toolchain.javaVersionOutput,
  javacVersion: toolchain.javacVersionOutput,
  source: toolchain.source,
  status: "ready",
};

if (requestedArguments.includes("--doctor")) {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ event: "java.toolchain.ready", ...summary })}\n`);
  const isWindows = process.platform === "win32";
  const wrapper = join(
    workspaceRoot,
    "services",
    "central-service",
    isWindows ? "mvnw.cmd" : "mvnw",
  );
  const mavenArguments = [
    "-f",
    join(workspaceRoot, "services", "central-service", "pom.xml"),
  ];
  if (requestedArguments.includes("--offline")) {
    mavenArguments.push("-o");
  }
  mavenArguments.push("verify");

  const result = spawnSync(wrapper, mavenArguments, {
    cwd: workspaceRoot,
    env: withJavaToolchainEnvironment(toolchain),
    shell: isWindows,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
