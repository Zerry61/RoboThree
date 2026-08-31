import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateWorkspaceAttachmentIdentity } from
  "../src/bootstrap/create-desktop-private-runtime.js";
import { SqliteDesktopFoundationPersistence } from
  "../src/adapters/sqlite/sqlite-desktop-foundation-persistence.js";
import { FakeClock } from "../src/adapters/fake/fake-clock.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("VS2.2 workspace attachment durable identity", () => {
  it("accepts the registered bytes and rejects a same-path replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs22-identity-"));
    temporaryDirectories.push(directory);
    const targetRealPath = join(directory, "项目资料.docx");
    const original = Buffer.from("original-docx-bytes");
    await writeFile(targetRealPath, original);
    const registration = {
      artifactId: `artifact:${"1".repeat(64)}`,
      workspaceGrantId: "workspace:one",
      relativePath: "项目资料.docx",
      sourceId: `sha256:${"2".repeat(64)}`,
      sourceDigest: `sha256:${"3".repeat(64)}`,
      fileSha256: createHash("sha256").update(original).digest("hex"),
      byteSize: original.byteLength,
      displayName: "项目资料.docx",
      kind: "document",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createdAt: "2026-08-29T00:00:00.000Z",
      previewState: "unsupported",
      metadata: {},
    } as const;
    const manualArtifacts = {
      findManualArtifactRegistrationByWorkspacePath: async () => registration,
    } as never;

    await expect(validateWorkspaceAttachmentIdentity({
      capabilityId: "tool.document.docx.read",
      workspaceGrantId: "workspace:one",
      relativePath: "项目资料.docx",
      targetRealPath,
      manualArtifacts,
    })).resolves.toBeUndefined();

    await writeFile(targetRealPath, "replacement-docx-bytes");
    await expect(validateWorkspaceAttachmentIdentity({
      capabilityId: "tool.document.docx.read",
      workspaceGrantId: "workspace:one",
      relativePath: "项目资料.docx",
      targetRealPath,
      manualArtifacts,
    })).rejects.toThrow("workspace.attachment_identity_changed");
  });

  it("preserves the VS2.1 explicit relative-path flow when no attachment was registered", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs22-unregistered-"));
    temporaryDirectories.push(directory);
    const targetRealPath = join(directory, "manual.pdf");
    await writeFile(targetRealPath, "pdf-fixture");
    const manualArtifacts = {
      findManualArtifactRegistrationByWorkspacePath: async () => undefined,
    } as never;

    await expect(validateWorkspaceAttachmentIdentity({
      capabilityId: "tool.document.pdf.extract_text",
      workspaceGrantId: "workspace:one",
      relativePath: "manual.pdf",
      targetRealPath,
      manualArtifacts,
    })).resolves.toBeUndefined();
  });

  it("restores the exact attachment identity from the original SQLite file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs22-reopen-"));
    temporaryDirectories.push(directory);
    const targetRealPath = join(directory, "source.pdf");
    const databasePath = join(directory, "core.sqlite");
    const bytes = Buffer.from("durable-pdf-source");
    await writeFile(targetRealPath, bytes);
    const record = {
      artifactId: `artifact:${"4".repeat(64)}`,
      workspaceGrantId: "workspace:one",
      relativePath: "source.pdf",
      sourceId: `sha256:${"5".repeat(64)}`,
      sourceDigest: `sha256:${"6".repeat(64)}`,
      fileSha256: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
      displayName: "source.pdf",
      kind: "document" as const,
      mediaType: "application/pdf",
      createdAt: "2026-08-29T00:00:00.000Z",
      previewState: "unsupported" as const,
      metadata: {},
    };
    const clock = new FakeClock(record.createdAt);
    let persistence = new SqliteDesktopFoundationPersistence({ databasePath, clock });
    await persistence.start();
    await persistence.commitManualArtifactRegistration({
      record,
      commandId: "019f8d00-0000-7000-8000-000000000090",
      requestDigest: `sha256:${"7".repeat(64)}`,
      committedAt: record.createdAt,
    });
    await persistence.stop();

    persistence = new SqliteDesktopFoundationPersistence({ databasePath, clock });
    await persistence.start();
    try {
      await expect(validateWorkspaceAttachmentIdentity({
        capabilityId: "tool.document.pdf.extract_text",
        workspaceGrantId: record.workspaceGrantId,
        relativePath: record.relativePath,
        targetRealPath,
        manualArtifacts: persistence,
      })).resolves.toBeUndefined();
    } finally {
      await persistence.stop();
    }
  });
});
