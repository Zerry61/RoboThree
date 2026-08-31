import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "../../..");
const sourcePath = resolve(
  workspaceRoot,
  "services/core/native/macos/robothree-personal-credential-helper.m",
);
const outputDirectory = resolve(
  workspaceRoot,
  "apps/desktop/resources/personal-credential-helper",
);
const helperPath = resolve(outputDirectory, "robothree-personal-credential-helper");
const temporaryHelperPath = `${helperPath}.unsigned`;
const manifestPath = resolve(outputDirectory, "manifest.json");

if (process.platform !== "darwin") {
  throw new Error("Personal Credential Helper production asset can only be built on macOS");
}

const signingIdentity = requiredBuildInput("ROBOTHREE_CODESIGN_IDENTITY");
const designatedRequirement = requiredBuildInput("ROBOTHREE_DESIGNATED_REQUIREMENT");
const teamIdentifier = requiredBuildInput("ROBOTHREE_TEAM_IDENTIFIER");
const buildRevision = requiredBuildInput("ROBOTHREE_BUILD_REVISION");
if (!/^[A-Z0-9]{6,20}$/u.test(teamIdentifier)) {
  throw new Error("ROBOTHREE_TEAM_IDENTIFIER is invalid");
}

await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
await run("/usr/bin/xcrun", [
  "clang",
  "-fobjc-arc",
  "-framework",
  "Foundation",
  "-framework",
  "Security",
  "-o",
  temporaryHelperPath,
  sourcePath,
], { timeout: 60_000, maxBuffer: 64 * 1024 });
await chmod(temporaryHelperPath, 0o755);
await run("/usr/bin/codesign", [
  "--force",
  "--options",
  "runtime",
  "--sign",
  signingIdentity,
  temporaryHelperPath,
], { timeout: 60_000, maxBuffer: 64 * 1024 });
await run("/usr/bin/codesign", [
  "--verify",
  "--strict",
  "-R",
  designatedRequirement,
  temporaryHelperPath,
], { timeout: 10_000, maxBuffer: 64 * 1024 });
const signatureDetails = await run(
  "/usr/bin/codesign",
  ["-dv", "--verbose=4", temporaryHelperPath],
  { timeout: 10_000, maxBuffer: 64 * 1024 },
);
if (!signatureDetails.stderr.split(/\r?\n/u)
  .some((line) => line === `TeamIdentifier=${teamIdentifier}`)) {
  throw new Error("Signed Personal Credential Helper Team Identifier does not match");
}
await rename(temporaryHelperPath, helperPath);
const bytes = await readFile(helperPath);
const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
bytes.fill(0);
const manifest = {
  schemaVersion: "personal-credential-helper-manifest.v1",
  helperRelativePath: "robothree-personal-credential-helper",
  protocolVersion: "personal-keychain-helper.v1",
  sha256,
  designatedRequirement,
  teamIdentifier,
  buildRevision,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644,
});

function requiredBuildInput(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required; ad-hoc signing is not accepted`);
  }
  return value;
}
