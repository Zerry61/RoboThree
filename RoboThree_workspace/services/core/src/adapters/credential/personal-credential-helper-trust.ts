import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

import { PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION } from "./personal-credential-helper-protocol.js";

const execFile = promisify(execFileCallback);

export type PersonalCredentialHelperDescriptor = Readonly<{
  helperPath: string;
  packageRootPath: string;
  manifestSha256: `sha256:${string}`;
  protocolVersion: typeof PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION;
  activation: "test_isolated" | "production_verified";
  testKeychainPath?: string;
  designatedRequirement?: string;
  teamIdentifier?: string;
}>;

export type VerifiedPersonalCredentialHelper = Readonly<{
  helperPath: string;
  protocolVersion: typeof PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION;
  productionReady: boolean;
  testKeychainPath?: string;
}>;

export async function verifyPersonalCredentialHelperDescriptor(
  descriptor: PersonalCredentialHelperDescriptor,
  dependencies: Readonly<{
    verifyProductionSignature?: (input: {
      helperPath: string;
      designatedRequirement: string;
      teamIdentifier: string;
    }) => Promise<boolean>;
  }> = {},
): Promise<VerifiedPersonalCredentialHelper | undefined> {
  try {
    if (descriptor.protocolVersion !== PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION) return undefined;
    const packageRoot = await realpath(resolve(descriptor.packageRootPath));
    const configuredHelperPath = resolve(descriptor.helperPath);
    const configuredItem = await lstat(configuredHelperPath);
    if (configuredItem.isSymbolicLink()) return undefined;
    const helperPath = await realpath(configuredHelperPath);
    const child = relative(packageRoot, helperPath);
    if (child === "" || child === ".." || child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      return undefined;
    }
    const item = await lstat(helperPath);
    if (!item.isFile() || item.isSymbolicLink() || item.uid !== process.getuid?.()
      || (item.mode & 0o022) !== 0) return undefined;
    const bytes = await readFile(helperPath);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    bytes.fill(0);
    if (digest !== descriptor.manifestSha256) return undefined;

    if (descriptor.activation === "production_verified") {
      if (descriptor.designatedRequirement === undefined || descriptor.teamIdentifier === undefined) {
        return undefined;
      }
      const verifier = dependencies.verifyProductionSignature ?? verifyProductionSignature;
      if (!await verifier({
        helperPath,
        designatedRequirement: descriptor.designatedRequirement,
        teamIdentifier: descriptor.teamIdentifier,
      })) return undefined;
    } else if (descriptor.testKeychainPath === undefined) {
      return undefined;
    }
    return Object.freeze({
      helperPath,
      protocolVersion: descriptor.protocolVersion,
      productionReady: descriptor.activation === "production_verified",
      ...(descriptor.testKeychainPath === undefined
        ? {}
        : { testKeychainPath: descriptor.testKeychainPath }),
    });
  } catch {
    return undefined;
  }
}

async function verifyProductionSignature(input: {
  helperPath: string;
  designatedRequirement: string;
  teamIdentifier: string;
}): Promise<boolean> {
  try {
    await execFile("/usr/bin/codesign", [
      "--verify",
      "--strict",
      "-R",
      input.designatedRequirement,
      input.helperPath,
    ], { timeout: 5_000, maxBuffer: 32_768 });
    const details = await execFile("/usr/bin/codesign", ["-dv", "--verbose=4", input.helperPath], {
      timeout: 5_000,
      maxBuffer: 32_768,
    });
    return details.stderr.split(/\r?\n/u)
      .some((line) => line === `TeamIdentifier=${input.teamIdentifier}`);
  } catch {
    return false;
  }
}
