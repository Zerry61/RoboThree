import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const PERSONAL_CREDENTIAL_HELPER_RESOURCE_DIRECTORY =
  "personal-credential-helper" as const;
export const PERSONAL_CREDENTIAL_HELPER_MANIFEST_FILE = "manifest.json" as const;
export const PERSONAL_CREDENTIAL_HELPER_BINARY_FILE =
  "robothree-personal-credential-helper" as const;

export type PackagedPersonalCredentialHelperDescriptor = Readonly<{
  helperPath: string;
  packageRootPath: string;
  manifestSha256: `sha256:${string}`;
  protocolVersion: "personal-keychain-helper.v1";
  activation: "production_verified";
  designatedRequirement: string;
  teamIdentifier: string;
}>;

type Manifest = Readonly<{
  schemaVersion: "personal-credential-helper-manifest.v1";
  helperRelativePath: typeof PERSONAL_CREDENTIAL_HELPER_BINARY_FILE;
  protocolVersion: "personal-keychain-helper.v1";
  sha256: `sha256:${string}`;
  designatedRequirement: string;
  teamIdentifier: string;
  buildRevision: string;
}>;

export async function resolvePackagedPersonalCredentialHelper(
  resourcesPath: string,
): Promise<PackagedPersonalCredentialHelperDescriptor | undefined> {
  try {
    if (!isAbsolute(resourcesPath)) return undefined;
    const packageRootPath = await realpath(resolve(resourcesPath));
    const resourceDirectory = join(
      packageRootPath,
      PERSONAL_CREDENTIAL_HELPER_RESOURCE_DIRECTORY,
    );
    const resourceItem = await lstat(resourceDirectory);
    if (!resourceItem.isDirectory() || resourceItem.isSymbolicLink()) return undefined;
    const manifestPath = join(resourceDirectory, PERSONAL_CREDENTIAL_HELPER_MANIFEST_FILE);
    const manifestItem = await lstat(manifestPath);
    if (!manifestItem.isFile() || manifestItem.isSymbolicLink()) return undefined;
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    const helperPath = join(resourceDirectory, manifest.helperRelativePath);
    const helperItem = await lstat(helperPath);
    if (!helperItem.isFile() || helperItem.isSymbolicLink()) return undefined;
    const realHelperPath = await realpath(helperPath);
    const child = relative(packageRootPath, realHelperPath);
    if (child === "" || child === ".." || child.startsWith(`..${separator()}`)) return undefined;
    return Object.freeze({
      helperPath: realHelperPath,
      packageRootPath,
      manifestSha256: manifest.sha256,
      protocolVersion: manifest.protocolVersion,
      activation: "production_verified",
      designatedRequirement: manifest.designatedRequirement,
      teamIdentifier: manifest.teamIdentifier,
    });
  } catch {
    return undefined;
  }
}

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value)
    || Object.keys(value).sort().join(",")
      !== [
        "buildRevision",
        "designatedRequirement",
        "helperRelativePath",
        "protocolVersion",
        "schemaVersion",
        "sha256",
        "teamIdentifier",
      ].sort().join(",")
    || value.schemaVersion !== "personal-credential-helper-manifest.v1"
    || value.helperRelativePath !== PERSONAL_CREDENTIAL_HELPER_BINARY_FILE
    || value.protocolVersion !== "personal-keychain-helper.v1"
    || typeof value.sha256 !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(value.sha256)
    || typeof value.designatedRequirement !== "string"
    || value.designatedRequirement.length < 8
    || value.designatedRequirement.length > 2_048
    || typeof value.teamIdentifier !== "string"
    || !/^[A-Z0-9]{6,20}$/u.test(value.teamIdentifier)
    || typeof value.buildRevision !== "string"
    || value.buildRevision.length < 1
    || value.buildRevision.length > 160) {
    throw new Error("Personal Credential Helper manifest is invalid");
  }
  return value as Manifest;
}

function separator(): "/" | "\\" {
  return process.platform === "win32" ? "\\" : "/";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
