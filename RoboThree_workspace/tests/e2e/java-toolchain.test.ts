import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseJavaMajor,
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "../../scripts/java-toolchain.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, {
    force: true,
    recursive: true,
  })));
});

describe("Java toolchain resolution", () => {
  it("parses Java and javac major versions", () => {
    expect(parseJavaMajor('openjdk version "21.0.11" 2026-04-21 LTS')).toBe(21);
    expect(parseJavaMajor("javac 21.0.11")).toBe(21);
    expect(parseJavaMajor('java version "1.8.0_401"')).toBe(8);
  });

  it("accepts an explicit Java 21 JDK and prepares its child environment", async () => {
    const javaHome = await createFakeJdk("21.0.11");
    const toolchain = await resolveJavaToolchain({
      environment: { JAVA_HOME: javaHome, PATH: "/usr/bin" },
      platform: "darwin",
    });

    expect(toolchain).toMatchObject({
      expectedMajor: 21,
      javaHome,
      source: "JAVA_HOME",
    });
    expect(withJavaToolchainEnvironment(toolchain, { PATH: "/usr/bin" })).toMatchObject({
      JAVA_HOME: javaHome,
      PATH: `${join(javaHome, "bin")}:/usr/bin`,
    });
  });

  it("fails closed when explicit JAVA_HOME points to another major", async () => {
    const javaHome = await createFakeJdk("17.0.12");

    await expect(resolveJavaToolchain({
      environment: { JAVA_HOME: javaHome, PATH: "/usr/bin" },
      platform: "darwin",
    })).rejects.toThrow("must provide Java 21");
  });
});

async function createFakeJdk(version: string): Promise<string> {
  const javaHome = await mkdtemp(join(tmpdir(), "robothree-jdk-"));
  temporaryDirectories.push(javaHome);
  const bin = join(javaHome, "bin");
  await mkdir(bin);
  const java = join(bin, "java");
  const javac = join(bin, "javac");
  await writeFile(java, `#!/bin/sh\nprintf 'openjdk version "${version}"\\n' >&2\n`);
  await writeFile(javac, `#!/bin/sh\nprintf 'javac ${version}\\n'\n`);
  await Promise.all([chmod(java, 0o755), chmod(javac, 0o755)]);
  return javaHome;
}
