import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../src/ports/clock.js";
import {
  DiscussionFileNameGenerator,
  DiscussionMarkdownCodec,
  DiscussionRepository,
} from "../../src/index.js";

class FixedClock implements Clock {
  #v: string[]; #i = 0;
  constructor(v: string[]) { this.#v = v; }
  now(): string {
    const val = this.#v[this.#i] ?? this.#v[this.#v.length - 1] ?? "2026-07-25T15:30:45+08:00";
    if (this.#i < this.#v.length - 1) this.#i += 1;
    return val;
  }
}
const ISO = "2026-07-25T15:30:45.123+08:00";

async function makeWS() {
  const w = await mkdtemp(join(tmpdir(), "r3-disc-"));
  return { workspace: w, dir: join(w, "讨论区") };
}

describe("DiscussionRepository", () => {
  let w = "", d = "";
  beforeEach(async () => { const p = await makeWS(); w = p.workspace; d = p.dir; });
  afterEach(async () => { if (w) await rm(w, { recursive: true, force: true }); });

  it("writes and reads via day folder", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    const alloc = await repo.allocateFileName("codex", "test");
    expect(alloc.fileName).toMatch(/^001-test-cx\.md$/u);
    expect(alloc.dayDir.endsWith("20260725")).toBe(true);
    await repo.write({ directory: alloc.dayDir, fileName: alloc.fileName,
      content: "---\nid: DISC-20260725-001-test-cx\nfrom: codex\nto: claude-code\ncreated_at: 2026-07-25T15:30:45+08:00\n---\n\n正文\n" });
    const list = await repo.list();
    expect(list.entries.length).toBe(1);
    expect(list.entries[0]?.id).toMatch(/^DISC-20260725-001-test-cx$/u);
  });

  it("allocates distinct sequences", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO, ISO]), { directory: d, workspaceRoot: w });
    const a = await repo.allocateFileName("codex", "x");
    const b = await repo.allocateFileName("codex", "y");
    expect(a.fileName).not.toBe(b.fileName);
  });

  it("appends reply via day folder", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    const alloc = await repo.allocateFileName("codex", "thread");
    await repo.write({ directory: alloc.dayDir, fileName: alloc.fileName,
      content: "---\nid: DISC-20260725-001-thread-cx\nfrom: codex\nto: claude-code\ncreated_at: 2026-07-25T15:30:45+08:00\n---\n\n主帖\n" });
    await repo.appendToEntry("DISC-20260725-001-thread-cx", alloc.fileName, "──\n## Reply: cc → cx @ 2026-07-25T16:00:00+08:00\n\n回复\n");
    const list = await repo.list();
    expect(list.entries[0]?.content).toContain("主帖");
    expect(list.entries[0]?.content).toContain("回复");
  });

  it("sorts entries", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    const codec = new DiscussionMarkdownCodec();
    await repo.ready();
    await mkdir(join(d, "20260725"), { recursive: true });
    const files = ["002-beta-cx.md", "001-alpha-cc.md", "003-gamma-cx.md"];
    for (const fn of files) {
      const base = fn.replace(/\.md$/u, "");
      await writeFile(join(d, "20260725", fn), codec.encode({
        id: `DISC-20260725-${base}`, from: "codex", to: ["claude-code"], createdAt: ISO,
        content: fn, fileName: fn, filePath: join(d, "20260725", fn),
      }), "utf8");
    }
    const list = await repo.list();
    expect(list.entries.map(e => e.fileName)).toEqual(files.slice().sort());
  });

  it("isolates corrupted files", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    await repo.ready();
    await mkdir(join(d, "20260725"), { recursive: true });
    await writeFile(join(d, "20260725/001-ok-cx.md"),
      "---\nid: DISC-20260725-001-ok-cx\nfrom: codex\nto: claude-code\ncreated_at: 2026-07-25T15:30:45+08:00\n---\n\nok\n", "utf8");
    await writeFile(join(d, "20260725/002-bad-cc.md"), "broken", "utf8");
    const list = await repo.list();
    expect(list.entries.map(e => e.fileName)).toEqual(["001-ok-cx.md"]);
  });

  it("ignores hidden/temp files", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    await repo.ready();
    await mkdir(join(d, "20260725"), { recursive: true });
    await writeFile(join(d, "20260725/.a.tmp"), "x", "utf8");
    expect((await repo.list()).entries.length).toBe(0);
  });

  it("rejects path traversal in file name", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    // `..` in fileName is caught before the workspace check
    await expect(repo.write({ directory: d, fileName: "../x.md", content: "x" })).rejects.toThrow(/traversal/iu);
  });
  it("rejects write to path outside workspace", async () => {
    const repo = new DiscussionRepository(new FixedClock([ISO]), { directory: d, workspaceRoot: w });
    await expect(repo.write({ directory: "/tmp", fileName: "001-x-cx.md", content: "x" })).rejects.toThrow(/escape|workspace/iu);
  });
});

describe("DiscussionFileNameGenerator.parseFileName", () => {
  it("handles old format for backward compat", () => {
    expect(DiscussionFileNameGenerator.parseFileName("0725-001-kaf-cx.md")?.dailySeq).toBe(1);
  });
});
