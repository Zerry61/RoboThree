import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SecuredDocumentSourceError,
  readSecuredDocumentBytes,
} from "../../src/index.js";

describe("SecuredDocumentSource", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "dw-source-"));
    roots.push(root);
    return root;
  }

  it("reads via resolve/stat/open/fstat identity and returns standalone bytes", async () => {
    const root = tempRoot();
    const file = join(root, "sample.pdf");
    writeFileSync(file, Buffer.from("%PDF-foundation"));

    const result = await readSecuredDocumentBytes(root, "sample.pdf", 1024, {
      readChunkBytes: 3,
    });

    expect(result.fileBytes).toBe(15);
    expect(result.canonicalExtension).toBe("pdf");
    expect(Buffer.from(result.bytes.bytes).toString("utf8")).toBe("%PDF-foundation");
    expect(result.bytes.bytes.byteOffset).toBe(0);
    expect(result.bytes.bytes.byteLength).toBe(result.bytes.bytes.buffer.byteLength);
    expect(result.bytes.transferList).toEqual([result.bytes.bytes.buffer]);
  });

  it("rejects files over maxFileBytes before opening", async () => {
    const root = tempRoot();
    const file = join(root, "large.bin");
    writeFileSync(file, Buffer.alloc(8));
    let opened = false;

    await expect(
      readSecuredDocumentBytes(root, "large.bin", 4, {
        openFile: async () => {
          opened = true;
          throw new Error("should not open");
        },
      }),
    ).rejects.toMatchObject({
      code: "secured_source.file_too_large",
    });
    expect(opened).toBe(false);
  });

  it("fails closed when stat and fstat identity or size differ", async () => {
    const root = tempRoot();
    const file = join(root, "sample.bin");
    writeFileSync(file, Buffer.from("abcdef"));
    const original = statSync(file);

    await expect(
      readSecuredDocumentBytes(root, "sample.bin", 1024, {
        statFile: async () => original,
        openFile: async () => ({
          stat: async () => ({
            ...original,
            size: original.size + 1,
            isFile: () => true,
          }) as typeof original,
          read: async () => ({ bytesRead: 0, buffer: Buffer.alloc(0) }),
          close: async () => {},
        }),
      }),
    ).rejects.toMatchObject({
      code: "secured_source.identity_changed",
    });
  });

  it("closes FileHandle when cancellation happens during chunked read", async () => {
    const root = tempRoot();
    const file = join(root, "sample.bin");
    writeFileSync(file, Buffer.from("abcdef"));
    const fileStat = statSync(file);
    const controller = new AbortController();
    let closeCount = 0;
    let readCount = 0;

    await expect(
      readSecuredDocumentBytes(root, "sample.bin", 1024, {
        readChunkBytes: 2,
        signal: controller.signal,
        statFile: async () => fileStat,
        openFile: async () => ({
          stat: async () => fileStat,
          read: async (buffer: Uint8Array) => {
            readCount += 1;
            buffer.fill(0x61);
            if (readCount === 2) {
              controller.abort();
            }
            return { bytesRead: buffer.byteLength, buffer };
          },
          close: async () => {
            closeCount += 1;
          },
        }),
      }),
    ).rejects.toMatchObject({
      code: "secured_source.cancelled",
    });
    expect(closeCount).toBe(1);
    expect(readCount).toBe(2);
  });

  it("does not expose paths or file bytes in errors", async () => {
    const root = tempRoot();
    const file = join(root, "secret.bin");
    writeFileSync(file, Buffer.from("SECRET_BYTES"));

    try {
      await readSecuredDocumentBytes(root, "secret.bin", 1);
    } catch (error) {
      expect(error).toBeInstanceOf(SecuredDocumentSourceError);
      expect((error as Error).message).not.toContain(root);
      expect((error as Error).message).not.toContain("SECRET_BYTES");
    }
  });
});
