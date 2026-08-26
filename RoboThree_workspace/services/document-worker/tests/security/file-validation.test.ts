import { afterEach, describe, expect, it } from "vitest";
import {
  FileValidationError,
  detectFormatByMagic,
  isMagicConsistentWithExtension,
  readFileHeader,
  validateOoxmlStructure,
} from "../../src/security/file-validation.js";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("file validation", () => {
  let roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots = [];
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "dw-file-validation-"));
    roots.push(root);
    return root;
  }

  it("detects PDF and ZIP magic by reading only the bounded header", async () => {
    const root = tempRoot();
    const pdf = join(root, "sample.pdf");
    const zip = join(root, "sample.xlsx");
    writeFileSync(pdf, Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1024)]));
    writeFileSync(zip, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));

    expect(await detectFormatByMagic(pdf, { maxBytes: 5 })).toBe("pdf");
    expect(await detectFormatByMagic(zip, { maxBytes: 4 })).toBe("zip");
  });

  it("does not read more than maxBytes from sparse or oversized files", async () => {
    const root = tempRoot();
    const huge = join(root, "huge.pdf");
    writeFileSync(huge, Buffer.from("%PDF-"));
    truncateSync(huge, 1024 * 1024 * 1024);

    const result = await readFileHeader(huge, {
      maxBytes: 16,
      maxFileBytes: 2 * 1024 * 1024 * 1024,
    });

    expect(result.fileBytes).toBe(1024 * 1024 * 1024);
    expect(result.bytesRead).toBe(16);
    expect(result.head.length).toBe(16);
  });

  it("rejects invalid header limits and files above maxFileBytes before opening", async () => {
    const root = tempRoot();
    const file = join(root, "sample.pdf");
    writeFileSync(file, "%PDF-data");
    let opened = false;

    await expect(readFileHeader(file, { maxBytes: 0 })).rejects.toMatchObject({
      code: "file_validation.invalid_limit",
    });

    await expect(
      readFileHeader(file, {
        maxBytes: 8,
        maxFileBytes: 1,
        openFile: async () => {
          opened = true;
          throw new Error("should not open");
        },
      }),
    ).rejects.toMatchObject({
      code: "file_validation.file_too_large",
    });
    expect(opened).toBe(false);
  });

  it("closes FileHandle on success, read failure, and cancellation", async () => {
    let closeCount = 0;
    const statFile = async () => ({ size: 8 });

    await readFileHeader("virtual.pdf", {
      maxBytes: 4,
      statFile,
      openFile: async () => ({
        read: async (buffer: Buffer) => {
          buffer.write("%PDF");
          return { bytesRead: 4, buffer };
        },
        close: async () => {
          closeCount += 1;
        },
      }),
    });
    expect(closeCount).toBe(1);

    await expect(
      readFileHeader("virtual.pdf", {
        maxBytes: 4,
        statFile,
        openFile: async () => ({
          read: async () => {
            throw new Error("read failed");
          },
          close: async () => {
            closeCount += 1;
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "file_validation.read_failed" });
    expect(closeCount).toBe(2);

    const controller = new AbortController();
    await expect(
      readFileHeader("virtual.pdf", {
        maxBytes: 4,
        statFile,
        signal: controller.signal,
        openFile: async () => ({
          read: async () => {
            controller.abort();
            return { bytesRead: 0, buffer: Buffer.alloc(0) };
          },
          close: async () => {
            closeCount += 1;
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "file_validation.cancelled" });
    expect(closeCount).toBe(3);
  });

  it("checks magic hints against extensions", () => {
    expect(isMagicConsistentWithExtension("pdf", ".pdf")).toBe(true);
    expect(isMagicConsistentWithExtension("zip", ".xlsx")).toBe(true);
    expect(isMagicConsistentWithExtension("zip", ".docx")).toBe(true);
    expect(isMagicConsistentWithExtension("pdf", ".xlsx")).toBe(false);
    expect(isMagicConsistentWithExtension(null, ".pdf")).toBe(false);
  });

  it("fails closed for OOXML structure validation until DTP-1 parser implementation", async () => {
    const result = await validateOoxmlStructure("sample.xlsx");

    expect(result).toEqual({
      valid: false,
      reason: "validation_unavailable",
      errorCode: "unsupported_feature",
    });
  });

  it("does not expose file path or header bytes in validation errors", async () => {
    const root = tempRoot();
    const file = join(root, "sample.pdf");
    writeFileSync(file, "%PDF-data");

    try {
      await readFileHeader(file, { maxBytes: 999_999 });
    } catch (error) {
      expect(error).toBeInstanceOf(FileValidationError);
      expect((error as Error).message).not.toContain(root);
      expect((error as Error).message).not.toContain("%PDF");
    }
  });
});
