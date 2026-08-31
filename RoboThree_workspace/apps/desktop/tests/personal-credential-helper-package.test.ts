import { createHash } from "node:crypto";
import { chmod, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  PERSONAL_CREDENTIAL_HELPER_BINARY_FILE,
  PERSONAL_CREDENTIAL_HELPER_MANIFEST_FILE,
  PERSONAL_CREDENTIAL_HELPER_RESOURCE_DIRECTORY,
  resolvePackagedPersonalCredentialHelper,
} from "../src/main/personal-credential-helper-package.js";

describe("DFI-4A.4.1 packaged Personal Credential Helper", () => {
  it("resolves only the fixed bundle resource and immutable manifest", async () => {
    const fixture = await helperFixture();
    await expect(resolvePackagedPersonalCredentialHelper(fixture.resourcesPath))
      .resolves.toEqual({
        helperPath: fixture.helperPath,
        packageRootPath: fixture.resourcesPath,
        manifestSha256: fixture.digest,
        protocolVersion: "personal-keychain-helper.v1",
        activation: "production_verified",
        designatedRequirement: "identifier org.robothree.personal-credential-helper",
        teamIdentifier: "ROBOTHREE1",
      });
  });

  it("rejects a symlinked Helper even when the manifest digest matches", async () => {
    const fixture = await helperFixture({ symlinkHelper: true });
    await expect(resolvePackagedPersonalCredentialHelper(fixture.resourcesPath))
      .resolves.toBeUndefined();
  });

  it("preserves the manifest digest for Core revalidation and rejects path drift", async () => {
    const fixture = await helperFixture({ manifestDigest: `sha256:${"0".repeat(64)}` });
    await expect(resolvePackagedPersonalCredentialHelper(fixture.resourcesPath))
      .resolves.toMatchObject({ manifestSha256: `sha256:${"0".repeat(64)}` });

    const resourceDirectory = join(
      fixture.resourcesPath,
      PERSONAL_CREDENTIAL_HELPER_RESOURCE_DIRECTORY,
    );
    await writeFile(join(resourceDirectory, PERSONAL_CREDENTIAL_HELPER_MANIFEST_FILE), JSON.stringify({
      ...manifest(fixture.digest),
      helperRelativePath: "../outside-helper",
    }));
    await expect(resolvePackagedPersonalCredentialHelper(fixture.resourcesPath))
      .resolves.toBeUndefined();
  });
});

async function helperFixture(input: Readonly<{
  symlinkHelper?: boolean;
  manifestDigest?: `sha256:${string}`;
}> = {}) {
  const resourcesPath = await mkdtemp(join(tmpdir(), "robothree-dfi4a41-helper-"));
  const resourceDirectory = join(resourcesPath, PERSONAL_CREDENTIAL_HELPER_RESOURCE_DIRECTORY);
  await mkdir(resourceDirectory, { recursive: true });
  const helperPath = join(resourceDirectory, PERSONAL_CREDENTIAL_HELPER_BINARY_FILE);
  const bytes = Buffer.from("signed-helper-fixture", "utf8");
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  if (input.symlinkHelper) {
    const outside = join(resourcesPath, "outside-helper");
    await writeFile(outside, bytes);
    await chmod(outside, 0o755);
    await symlink(outside, helperPath);
  } else {
    await writeFile(helperPath, bytes);
    await chmod(helperPath, 0o755);
  }
  await writeFile(
    join(resourceDirectory, PERSONAL_CREDENTIAL_HELPER_MANIFEST_FILE),
    `${JSON.stringify(manifest(input.manifestDigest ?? digest), null, 2)}\n`,
  );
  return {
    resourcesPath: await realpath(resourcesPath),
    helperPath: input.symlinkHelper ? helperPath : await realpath(helperPath),
    digest,
  };
}

function manifest(digest: `sha256:${string}`) {
  return {
    schemaVersion: "personal-credential-helper-manifest.v1",
    helperRelativePath: PERSONAL_CREDENTIAL_HELPER_BINARY_FILE,
    protocolVersion: "personal-keychain-helper.v1",
    sha256: digest,
    designatedRequirement: "identifier org.robothree.personal-credential-helper",
    teamIdentifier: "ROBOTHREE1",
    buildRevision: "dfi-4a.4.1-test",
  };
}
