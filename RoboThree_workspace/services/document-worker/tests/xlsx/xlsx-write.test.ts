import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  link as hardLink,
  readFile,
  readdir,
  mkdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  DOCUMENT_CAPABILITIES,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DocumentCapabilityRouter,
  XLSX_WRITE_CAPABILITY_ID,
  computeXlsxOverwriteRequestDigest,
  computeXlsxWriteRequestDigest,
  normalizeXlsxWriteOptions,
  validateXlsxOoxmlPreflight,
  writeXlsx,
} from "../../src/index.js";

import type {
  DocumentWorkerInvokeMessage,
  DocumentWorkerLimits,
  XlsxWriteFaultPoint,
} from "../../src/index.js";

const LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 2_000_000,
  maxOutputBytes: 2_000_000,
  maxPageCount: 10,
  maxDecompressionRatio: 100,
};

const IDEMPOTENCY_KEY = "dwe-1-idempotency-key";

const WORKBOOK_OPTIONS: Record<string, unknown> = {
  dateSystem: "1900",
  workbook: {
    sheets: [
      {
        name: "Main",
        rows: [
          {
            rowNumber: 2,
            cells: [
              { column: "B", type: "number", value: -0 },
              { column: "A", type: "string", value: "=SUM(A1:A2)" },
              { column: "C", type: "string", value: "+cmd" },
              { column: "D", type: "string", value: "-cmd" },
              { column: "E", type: "string", value: "@cmd" },
            ],
          },
          {
            rowNumber: 1,
            cells: [
              { column: "B", type: "boolean", value: true },
              { column: "A", type: "date", value: "2026-08-04T12:34:56.789Z" },
            ],
          },
        ],
      },
    ],
  },
} as const;

const OVERWRITE_WORKBOOK_OPTIONS: Record<string, unknown> = {
  dateSystem: "1900",
  workbook: {
    sheets: [
      {
        name: "Main",
        rows: [
          {
            rowNumber: 1,
            cells: [
              { column: "A", type: "string", value: "Overwritten by DWO-1" },
              { column: "B", type: "number", value: 99 },
            ],
          },
        ],
      },
    ],
  },
} as const;

const FAULT_POINTS: readonly XlsxWriteFaultPoint[] = [
  "beforeTempCreate",
  "afterTempCreate",
  "afterWriteBeforeFsync",
  "afterFsyncBeforeLink",
  "duringLink",
  "afterLinkBeforeParentFsync",
  "afterParentFsyncBeforeVerify",
  "afterVerifyBeforeUnlink",
  "afterUnlink",
];
const PUBLISH_FAULT_POINTS = new Set<XlsxWriteFaultPoint>([
  "duringLink",
  "duringRename",
  "afterRenameBeforeParentFsync",
  "afterLinkBeforeParentFsync",
  "afterParentFsyncBeforeVerify",
  "afterVerifyBeforeUnlink",
  "afterUnlink",
]);
const OVERWRITE_FAULT_POINTS: readonly XlsxWriteFaultPoint[] = [
  "afterLockCreate",
  "afterOverwritePreflight",
  "beforeTempCreate",
  "afterTempCreate",
  "afterWriteBeforeFsync",
  "afterFsyncBeforeLink",
  "afterOverwriteRehashBeforeRename",
  "duringRename",
  "afterRenameBeforeParentFsync",
  "afterParentFsyncBeforeVerify",
  "afterVerifyBeforeUnlink",
  "afterUnlink",
];

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robothree-dwe-"));
  tempRoots.push(root);
  return root;
}

function digestFor(relativePath: string, options: Record<string, unknown>): string {
  const normalized = normalizeXlsxWriteOptions(options, LIMITS);
  return computeXlsxWriteRequestDigest(
    IDEMPOTENCY_KEY,
    relativePath,
    normalized.workbook,
  );
}

async function invokeWrite(
  workspaceRoot: string,
  relativePath: string,
  options: Record<string, unknown> = WORKBOOK_OPTIONS,
  overrides: Partial<Parameters<typeof writeXlsx>[0]> = {},
) {
  return writeXlsx({
    workspaceRoot,
    relativePath,
    options,
    limits: LIMITS,
    idempotencyKey: IDEMPOTENCY_KEY,
    requestDigest: digestFor(relativePath, options),
    signal: new AbortController().signal,
    ...overrides,
  });
}

function digestForOverwrite(
  relativePath: string,
  options: Record<string, unknown>,
  confirmedOldSha256: string,
): string {
  const normalized = normalizeXlsxWriteOptions(options, LIMITS);
  return computeXlsxOverwriteRequestDigest(
    IDEMPOTENCY_KEY,
    relativePath,
    normalized.workbook,
    confirmedOldSha256,
  );
}

function overwriteOptions(
  confirmedOldSha256: string,
  workbookOptions: Record<string, unknown> = OVERWRITE_WORKBOOK_OPTIONS,
): Record<string, unknown> {
  return {
    ...workbookOptions,
    mode: "overwrite_existing",
    overwrite: { confirmedOldSha256 },
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readWorkbook(bytes: Buffer): XLSX.WorkBook {
  return XLSX.read(bytes, {
    type: "buffer",
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    raw: true,
    WTF: true,
  });
}

function assertNoExecutableSpreadsheetContent(bytes: Buffer): void {
  validateXlsxOoxmlPreflight(bytes, "xlsx", LIMITS);
  const workbook = readWorkbook(bytes);
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    expect(worksheet).toBeDefined();
    for (const address of Object.keys(worksheet ?? {})) {
      if (address.startsWith("!")) continue;
      const cell = worksheet![address] as XLSX.CellObject & { l?: unknown };
      expect(cell.f).toBeUndefined();
      expect(cell.l).toBeUndefined();
    }
  }
}

async function tempEntries(root: string): Promise<string[]> {
  return (await readdir(root)).filter((name) => name.includes(".robothree-dw"));
}

async function seedXlsx(root: string, relativePath: string): Promise<{
  bytes: Buffer;
  sha256: string;
}> {
  await invokeWrite(root, relativePath);
  const bytes = await readFile(join(root, relativePath));
  return { bytes, sha256: sha256(bytes) };
}

describe("XLSX write private worker capability", () => {
  it("creates a new XLSX with link no-clobber publish, readback digest, and text-only formula-like strings", async () => {
    const root = await makeWorkspace();
    const result = await invokeWrite(root, "out.xlsx");
    const output = result.output as {
      format: string;
      relativePath: string;
      sha256: string;
      logicalWorkbookDigest: string;
      sheetCount: number;
      cellCount: number;
    };

    expect(output).toMatchObject({
      format: "xlsx",
      relativePath: "out.xlsx",
      sheetCount: 1,
      cellCount: 7,
    });

    const bytes = await readFile(join(root, "out.xlsx"));
    expect(output.sha256).toBe(sha256(bytes));
    await expect(stat(join(root, "out.xlsx"))).resolves.toMatchObject({ nlink: 1 });
    await expect(tempEntries(root)).resolves.toEqual([]);
    assertNoExecutableSpreadsheetContent(bytes);

    const workbook = readWorkbook(bytes);
    const worksheet = workbook.Sheets.Main!;
    expect(worksheet.A2).toMatchObject({ t: "s", v: "=SUM(A1:A2)" });
    expect(worksheet.C2).toMatchObject({ t: "s", v: "+cmd" });
    expect(worksheet.D2).toMatchObject({ t: "s", v: "-cmd" });
    expect(worksheet.E2).toMatchObject({ t: "s", v: "@cmd" });
    expect(worksheet.B2).toMatchObject({ t: "n", v: 0 });
  });

  it("keeps logicalWorkbookDigest stable across row and cell input ordering", () => {
    const left = normalizeXlsxWriteOptions(WORKBOOK_OPTIONS, LIMITS).workbook;
    const reordered = {
      dateSystem: "1900",
      workbook: {
        sheets: [
          {
            name: "Main",
            rows: [
              {
                rowNumber: 1,
                cells: [
                  { column: "A", type: "date", value: "2026-08-04T12:34:56.789Z" },
                  { column: "B", type: "boolean", value: true },
                ],
              },
              {
                rowNumber: 2,
                cells: [
                  { column: "E", type: "string", value: "@cmd" },
                  { column: "D", type: "string", value: "-cmd" },
                  { column: "C", type: "string", value: "+cmd" },
                  { column: "B", type: "number", value: 0 },
                  { column: "A", type: "string", value: "=SUM(A1:A2)" },
                ],
              },
            ],
          },
        ],
      },
    };
    const right = normalizeXlsxWriteOptions(reordered, LIMITS).workbook;
    expect(computeXlsxWriteRequestDigest(IDEMPOTENCY_KEY, "out.xlsx", left)).toBe(
      computeXlsxWriteRequestDigest(IDEMPOTENCY_KEY, "out.xlsx", right),
    );
  });

  it("rejects existing targets and concurrent target creation without overwriting", async () => {
    const root = await makeWorkspace();
    await writeFile(join(root, "exists.xlsx"), "original");
    await expect(invokeWrite(root, "exists.xlsx")).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "target_exists",
    });
    await expect(readFile(join(root, "exists.xlsx"), "utf8")).resolves.toBe("original");

    const racingRoot = await makeWorkspace();
    await expect(
      invokeWrite(racingRoot, "race.xlsx", WORKBOOK_OPTIONS, {
        dependencies: {
          link: async (_tempPath, targetPath) => {
            await writeFile(targetPath, "racing-writer");
            const error = new Error("exists") as NodeJS.ErrnoException;
            error.code = "EEXIST";
            throw error;
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "target_exists",
    });
    await expect(readFile(join(racingRoot, "race.xlsx"), "utf8")).resolves.toBe("racing-writer");
  });

  it("fails closed when hard-link publishing is unavailable", async () => {
    const root = await makeWorkspace();
    await expect(
      invokeWrite(root, "out.xlsx", WORKBOOK_OPTIONS, {
        dependencies: {
          link: async () => {
            const error = new Error("cross-device") as NodeJS.ErrnoException;
            error.code = "EXDEV";
            throw error;
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "internal_failure",
      detailCode: "publish_failed",
    });
    expect(existsSync(join(root, "out.xlsx"))).toBe(false);
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("closes and cleans resources when cancelled after temp creation", async () => {
    const root = await makeWorkspace();
    const controller = new AbortController();
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "cancelled.xlsx",
        options: WORKBOOK_OPTIONS,
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestFor("cancelled.xlsx", WORKBOOK_OPTIONS),
        signal: controller.signal,
        dependencies: {
          randomName: () => "cancelled",
          fault: (point) => {
            if (point === "afterTempCreate") {
              controller.abort();
            }
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(existsSync(join(root, "cancelled.xlsx"))).toBe(false);
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("fails closed for invalid paths, parent absence, symlink escape, bad digest, and output budget", async () => {
    const root = await makeWorkspace();
    await expect(invokeWrite(root, "../escape.xlsx")).rejects.toMatchObject({
      detailCode: "invalid_path",
    });
    await expect(invokeWrite(root, "missing/out.xlsx")).rejects.toMatchObject({
      detailCode: "parent_missing",
    });

    const outside = await makeWorkspace();
    await symlink(outside, join(root, "linked"));
    await expect(invokeWrite(root, "linked/out.xlsx")).rejects.toMatchObject({
      detailCode: "path_outside_workspace",
    });

    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "bad-digest.xlsx",
        options: WORKBOOK_OPTIONS,
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: "0".repeat(64),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "invalid_arguments",
    });

    await expect(
      invokeWrite(root, "too-large.xlsx", WORKBOOK_OPTIONS, {
        limits: { ...LIMITS, maxOutputBytes: 64 },
        requestDigest: digestFor("too-large.xlsx", WORKBOOK_OPTIONS),
      }),
    ).rejects.toMatchObject({
      code: "limit_exceeded",
      detailCode: "output_too_large",
    });
  });

  it("cleans temp files and never leaves partial targets across the nine crash windows", async () => {
    for (const point of FAULT_POINTS) {
      const root = await makeWorkspace();
      await expect(
        invokeWrite(root, `${point}.xlsx`, WORKBOOK_OPTIONS, {
          dependencies: {
            randomName: () => point,
            fault: (observed) => {
              if (observed === point) {
                throw new Error(`fault:${point}`);
              }
            },
          },
        }),
      ).rejects.toMatchObject({
        detailCode: PUBLISH_FAULT_POINTS.has(point)
          ? "publish_failed"
          : "generation_failed",
      });

      await expect(tempEntries(root)).resolves.toEqual([]);
      const targetPath = join(root, `${point}.xlsx`);
      if (existsSync(targetPath)) {
        assertNoExecutableSpreadsheetContent(await readFile(targetPath));
      }
    }
  });

  it("keeps repeated executions bounded with no temp files left behind", async () => {
    const root = await makeWorkspace();
    for (let index = 0; index < 100; index += 1) {
      await invokeWrite(root, `bounded-${index}.xlsx`);
    }
    await expect(tempEntries(root)).resolves.toEqual([]);
    const entries = await readdir(root);
    expect(entries).toHaveLength(100);
  });

  it("overwrites an existing XLSX only with private confirmed old digest and cleans lock/temp files", async () => {
    const root = await makeWorkspace();
    const relativePath = "overwrite.xlsx";
    const original = await seedXlsx(root, relativePath);
    const options = overwriteOptions(original.sha256);

    const result = await writeXlsx({
      workspaceRoot: root,
      relativePath,
      options,
      limits: LIMITS,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestDigest: digestForOverwrite(relativePath, OVERWRITE_WORKBOOK_OPTIONS, original.sha256),
      signal: new AbortController().signal,
    });

    const output = result.output as {
      relativePath: string;
      sha256: string;
      logicalWorkbookDigest: string;
      cellCount: number;
    };
    const bytes = await readFile(join(root, relativePath));
    expect(output.relativePath).toBe(relativePath);
    expect(output.sha256).toBe(sha256(bytes));
    expect(output.sha256).not.toBe(original.sha256);
    expect(bytes.equals(original.bytes)).toBe(false);
    expect(output.cellCount).toBe(2);
    assertNoExecutableSpreadsheetContent(bytes);
    expect(readWorkbook(bytes).Sheets.Main!.A1).toMatchObject({
      t: "s",
      v: "Overwritten by DWO-1",
    });
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("keeps overwrite disabled without private confirmation material", async () => {
    const root = await makeWorkspace();
    const relativePath = "requires-confirmation.xlsx";
    const original = await seedXlsx(root, relativePath);
    await expect(
      invokeWrite(root, relativePath, {
        ...OVERWRITE_WORKBOOK_OPTIONS,
        mode: "overwrite_existing",
      }),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "overwrite_requires_confirmation",
    });
    await expect(readFile(join(root, relativePath))).resolves.toEqual(original.bytes);
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("fails closed for overwrite target identity, hardlink, missing, and non-XLSX content", async () => {
    const root = await makeWorkspace();
    const oldSha256 = "a".repeat(64);
    const options = overwriteOptions(oldSha256);
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "missing.xlsx",
        options,
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite("missing.xlsx", OVERWRITE_WORKBOOK_OPTIONS, oldSha256),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ detailCode: "target_missing" });

    await mkdir(join(root, "folder.xlsx"));
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "folder.xlsx",
        options,
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite("folder.xlsx", OVERWRITE_WORKBOOK_OPTIONS, oldSha256),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ detailCode: "target_not_regular_file" });

    const outside = await makeWorkspace();
    await symlink(join(outside, "outside.xlsx"), join(root, "link.xlsx"));
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "link.xlsx",
        options,
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite("link.xlsx", OVERWRITE_WORKBOOK_OPTIONS, oldSha256),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ detailCode: "target_symlink_not_allowed" });

    const hardlinkSeed = await seedXlsx(root, "hardlink.xlsx");
    await hardLink(join(root, "hardlink.xlsx"), join(root, "hardlink-copy.xlsx"));
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "hardlink.xlsx",
        options: overwriteOptions(hardlinkSeed.sha256),
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite("hardlink.xlsx", OVERWRITE_WORKBOOK_OPTIONS, hardlinkSeed.sha256),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ detailCode: "target_hardlink_not_allowed" });

    await writeFile(join(root, "plain.xlsx"), "not an xlsx");
    const plainSha = sha256(Buffer.from("not an xlsx"));
    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath: "plain.xlsx",
        options: overwriteOptions(plainSha),
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite("plain.xlsx", OVERWRITE_WORKBOOK_OPTIONS, plainSha),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "target_not_xlsx",
    });
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("detects overwrite digest drift after generation and never clobbers the racing writer", async () => {
    const root = await makeWorkspace();
    const relativePath = "drift.xlsx";
    const original = await seedXlsx(root, relativePath);
    const racingWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      racingWorkbook,
      XLSX.utils.aoa_to_sheet([["racing-writer"]]),
      "Main",
    );
    const racingBytes = Buffer.from(XLSX.write(racingWorkbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer);

    await expect(
      writeXlsx({
        workspaceRoot: root,
        relativePath,
        options: overwriteOptions(original.sha256),
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite(relativePath, OVERWRITE_WORKBOOK_OPTIONS, original.sha256),
        signal: new AbortController().signal,
        dependencies: {
          fault: async (point) => {
            if (point === "afterOverwritePreflight") {
              await writeFile(join(root, relativePath), racingBytes);
            }
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_format",
      detailCode: "target_digest_changed",
    });

    await expect(readFile(join(root, relativePath))).resolves.toEqual(racingBytes);
    await expect(tempEntries(root)).resolves.toEqual([]);
  });

  it("cleans overwrite lock/temp files and leaves a valid target across crash windows", async () => {
    for (const point of OVERWRITE_FAULT_POINTS) {
      const root = await makeWorkspace();
      const relativePath = `${point}.xlsx`;
      const original = await seedXlsx(root, relativePath);

      await expect(
        writeXlsx({
          workspaceRoot: root,
          relativePath,
          options: overwriteOptions(original.sha256),
          limits: LIMITS,
          idempotencyKey: IDEMPOTENCY_KEY,
          requestDigest: digestForOverwrite(relativePath, OVERWRITE_WORKBOOK_OPTIONS, original.sha256),
          signal: new AbortController().signal,
          dependencies: {
            randomName: () => point,
            fault: (observed) => {
              if (observed === point) {
                throw new Error(`fault:${point}`);
              }
            },
          },
        }),
      ).rejects.toMatchObject({
        detailCode: PUBLISH_FAULT_POINTS.has(point)
          ? "publish_failed"
          : point === "afterLockCreate"
            ? "overwrite_cas_unsupported"
            : "generation_failed",
      });

      const bytes = await readFile(join(root, relativePath));
      assertNoExecutableSpreadsheetContent(bytes);
      await expect(tempEntries(root)).resolves.toEqual([]);
    }
  });

  it("keeps repeated overwrite executions bounded with one target and no temp or lock files", async () => {
    const root = await makeWorkspace();
    const relativePath = "bounded-overwrite.xlsx";
    let currentSha = (await seedXlsx(root, relativePath)).sha256;

    for (let index = 0; index < 100; index += 1) {
      const workbookOptions = {
        dateSystem: "1900",
        workbook: {
          sheets: [
            {
              name: "Main",
              rows: [
                {
                  rowNumber: 1,
                  cells: [
                    { column: "A", type: "string", value: `overwrite-${index}` },
                  ],
                },
              ],
            },
          ],
        },
      };
      await writeXlsx({
        workspaceRoot: root,
        relativePath,
        options: overwriteOptions(currentSha, workbookOptions),
        limits: LIMITS,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestDigest: digestForOverwrite(relativePath, workbookOptions, currentSha),
        signal: new AbortController().signal,
      });
      currentSha = sha256(await readFile(join(root, relativePath)));
    }

    await expect(tempEntries(root)).resolves.toEqual([]);
    const entries = await readdir(root);
    expect(entries).toEqual([relativePath]);
    const bytes = await readFile(join(root, relativePath));
    expect(readWorkbook(bytes).Sheets.Main!.A1).toMatchObject({
      t: "s",
      v: "overwrite-99",
    });
  });

  it("routes the write capability only through the Document Worker private router branch", async () => {
    const root = await makeWorkspace();
    const relativePath = "router.xlsx";
    const normalized = normalizeXlsxWriteOptions(WORKBOOK_OPTIONS, LIMITS);
    const invoke: DocumentWorkerInvokeMessage = {
      type: "invoke",
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      requestId: "req-write",
      actionId: "act-write",
      effectAttemptId: "eff-write",
      capabilityId: XLSX_WRITE_CAPABILITY_ID,
      workspaceRoot: root,
      relativePath,
      options: WORKBOOK_OPTIONS,
      limits: LIMITS,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      idempotencyKey: IDEMPOTENCY_KEY,
      requestDigest: computeXlsxWriteRequestDigest(
        IDEMPOTENCY_KEY,
        relativePath,
        normalized.workbook,
      ),
    };

    expect(DOCUMENT_CAPABILITIES).not.toContain(XLSX_WRITE_CAPABILITY_ID);
    const result = await new DocumentCapabilityRouter().invoke({
      invoke,
      signal: new AbortController().signal,
    });
    expect((result.output as { relativePath: string }).relativePath).toBe(relativePath);
    expect(existsSync(join(root, relativePath))).toBe(true);

    await expect(new DocumentCapabilityRouter().invoke({
      invoke: {
        ...invoke,
        protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
        relativePath: "public-write.xlsx",
      },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "unsupported_feature",
    });
  });
});
