import { readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const javaVersionFile = join(workspaceRoot, ".java-version");

export function parseJavaMajor(output) {
  const match = /(?:version\s+"?|javac\s+)(?:1\.)?(\d+)/iu.exec(output);
  return match === null ? undefined : Number.parseInt(match[1], 10);
}

export async function resolveJavaToolchain(options = {}) {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runCommand;
  const expectedMajor = await readRequiredMajor(options.versionFile ?? javaVersionFile);
  const explicitJavaHome = environment.JAVA_HOME?.trim();

  if (explicitJavaHome !== undefined && explicitJavaHome !== "") {
    return validateJavaHome({
      expectedMajor,
      javaHome: resolve(explicitJavaHome),
      run,
      source: "JAVA_HOME",
      platform,
    });
  }

  const candidates = [];
  if (platform === "darwin") {
    const discovered = run("/usr/libexec/java_home", ["-v", String(expectedMajor)]);
    if (discovered.status === 0 && discovered.stdout.trim() !== "") {
      candidates.push({
        javaHome: resolve(discovered.stdout.trim()),
        source: "macOS java_home",
      });
    }
  }

  const pathCandidate = await discoverJavaHomeFromPath({ environment, platform, run });
  if (pathCandidate !== undefined) {
    candidates.push(pathCandidate);
  }

  const failures = [];
  const seenHomes = new Set();
  for (const candidate of candidates) {
    if (seenHomes.has(candidate.javaHome)) {
      continue;
    }
    seenHomes.add(candidate.javaHome);
    try {
      return validateJavaHome({
        expectedMajor,
        javaHome: candidate.javaHome,
        run,
        source: candidate.source,
        platform,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const detail = failures.length === 0 ? "" : ` Checked candidates: ${failures.join(" | ")}`;
  throw new Error(
    `RoboThree Central requires a JDK ${expectedMajor}. Install a JDK, set JAVA_HOME, `
    + `or put matching java and javac executables on PATH.${detail}`,
  );
}

export function withJavaToolchainEnvironment(toolchain, environment = process.env) {
  const javaBin = join(toolchain.javaHome, "bin");
  const currentPath = environment.PATH ?? "";
  return {
    ...environment,
    JAVA_HOME: toolchain.javaHome,
    PATH: currentPath === "" ? javaBin : `${javaBin}${delimiter}${currentPath}`,
  };
}

async function readRequiredMajor(versionFile) {
  const declaredVersion = (await readFile(versionFile, "utf8")).trim();
  const match = /^(\d+)/u.exec(declaredVersion);
  if (match === null) {
    throw new Error(`${versionFile} must start with a Java major version`);
  }
  return Number.parseInt(match[1], 10);
}

async function discoverJavaHomeFromPath({ environment, platform, run }) {
  const lookupCommand = platform === "win32" ? "where" : "which";
  const lookup = run(lookupCommand, [platform === "win32" ? "java.exe" : "java"], {
    environment,
  });
  if (lookup.status !== 0 || lookup.stdout.trim() === "") {
    return undefined;
  }

  const firstExecutable = lookup.stdout.split(/\r?\n/u)[0]?.trim();
  if (firstExecutable === undefined || firstExecutable === "") {
    return undefined;
  }

  try {
    const canonicalExecutable = await realpath(firstExecutable);
    return {
      javaHome: dirname(dirname(canonicalExecutable)),
      source: "PATH",
    };
  } catch {
    return undefined;
  }
}

function validateJavaHome({ expectedMajor, javaHome, platform, run, source }) {
  const executableSuffix = platform === "win32" ? ".exe" : "";
  const javaExecutable = join(javaHome, "bin", `java${executableSuffix}`);
  const javacExecutable = join(javaHome, "bin", `javac${executableSuffix}`);
  const javaResult = run(javaExecutable, ["-version"]);
  const javacResult = run(javacExecutable, ["-version"]);

  if (javaResult.status !== 0 || javacResult.status !== 0) {
    throw new Error(`${source}=${javaHome} does not contain runnable java and javac executables`);
  }

  const javaOutput = `${javaResult.stdout}\n${javaResult.stderr}`.trim();
  const javacOutput = `${javacResult.stdout}\n${javacResult.stderr}`.trim();
  const javaMajor = parseJavaMajor(javaOutput);
  const javacMajor = parseJavaMajor(javacOutput);
  if (javaMajor !== expectedMajor || javacMajor !== expectedMajor) {
    throw new Error(
      `${source}=${javaHome} must provide Java ${expectedMajor}; `
      + `detected java=${String(javaMajor)} javac=${String(javacMajor)}`,
    );
  }

  return Object.freeze({
    expectedMajor,
    javaHome,
    javaVersionOutput: javaOutput.split(/\r?\n/u)[0] ?? javaOutput,
    javacVersionOutput: javacOutput.split(/\r?\n/u)[0] ?? javacOutput,
    source,
  });
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}
