import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../src/ports/clock.js";
import {
  AgentNameNormalizer, DiscussionMarkdownCodec, DiscussionRepository,
  DiscussionService, DiscussionValidationError,
} from "../../src/index.js";

class StepClock implements Clock {
  constructor(private d: Date, private step = 1) {}
  now(): string { const r = this.d; this.d = new Date(this.d.getTime() + this.step); return r.toISOString(); }
}
const ISO = "2026-07-22T15:30:45.000+08:00";

function mkSvcOn(repo: DiscussionRepository, clk: Clock, agentId: "codex" | "claude-code" | "kimi" | "minimax") {
  return new DiscussionService({
    repository: repo, normalizer: new AgentNameNormalizer(),
    codec: new DiscussionMarkdownCodec(), clock: clk, identity: { agentId },
  });
}

describe("DiscussionService", () => {
  let ws = "", dir = "", repo: DiscussionRepository, clk: StepClock;

  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "r3-disc-svc-"));
    dir = join(ws, "讨论区");
    await mkdir(dir, { recursive: true });
    clk = new StepClock(new Date(ISO), 5000); // big step to avoid same-second collisions
    repo = new DiscussionRepository(clk, { directory: dir, workspaceRoot: ws });
  });
  afterEach(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });

  it("posts with topic in file name", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    const r = await svc.post({ to: ["claude-code"], content: "结论", topic: "KAF-5.0" });
    expect(r.id).toMatch(/^DISC-20260722-\d{3}-kaf-50-cx$/u);
    expect(r.fileName).toMatch(/^\d{3}-kaf-50-cx\.md$/u);
  });

  it("defaults topic to note", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    const r = await svc.post({ to: ["kimi"], content: "hi" });
    expect(r.fileName).toMatch(/^\d{3}-note-/u);
  });

  it("rejects empty to", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    await expect(svc.post({ to: [], content: "x" })).rejects.toBeInstanceOf(DiscussionValidationError);
  });

  it("rejects empty content", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    await expect(svc.post({ to: ["kimi"], content: "  " })).rejects.toBeInstanceOf(DiscussionValidationError);
  });

  it("enforces from===identity", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    await svc.post({ to: ["claude-code"], content: "I am claude" });
    const list = await repo.list();
    expect(list.entries[0]?.from).toBe("codex");
  });

  it("reads only entries for currentAgent or all", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    await codex.post({ to: ["claude-code"], content: "a", topic: "x" });
    await codex.post({ to: ["kimi"], content: "b", topic: "y" });
    await codex.post({ to: ["all"], content: "c", topic: "z" });
    const claude = mkSvcOn(repo, clk, "claude-code");
    const read = await claude.read({ currentAgent: "claude-code", limit: 10 });
    const t = read.entries.flatMap(e => e.to);
    expect(t).toContain("claude-code");
    expect(t).toContain("all");
    expect(t).not.toContain("kimi");
  });

  it("filters by topic", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    await codex.post({ to: ["claude-code"], content: "a", topic: "KAF" });
    await codex.post({ to: ["claude-code"], content: "b", topic: "ADR" });
    const claude = mkSvcOn(repo, clk, "claude-code");
    const r = await claude.read({ currentAgent: "claude-code", topic: "KAF" });
    expect(r.entries.map(e => e.topic)).toEqual(["KAF"]);
  });

  it("honours limits", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    for (let i = 0; i < 6; i++) await codex.post({ to: ["claude-code"], content: `${i}` });
    const claude = mkSvcOn(repo, clk, "claude-code");
    expect((await claude.read({ currentAgent: "claude-code" })).entries.length).toBe(6);
    expect((await claude.read({ currentAgent: "claude-code", limit: 2 })).entries.length).toBe(2);
  });

  it("appends reply to existing thread by reply_to id", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    const orig = await codex.post({ to: ["claude-code"], content: "主帖", topic: "thread-test" });
    // Reply via replyTo
    const reply = await codex.post({ to: ["claude-code"], content: "我的回复", replyTo: orig.id });
    // Reply should land in the same file
    expect(reply.fileName).toBe(orig.fileName);
    expect(reply.id).toBe(orig.id);
    // File should contain both messages
    const list = await repo.list();
    const entry = list.entries.find(e => e.id === orig.id);
    expect(entry?.content).toContain("主帖");
    expect(entry?.content).toContain("我的回复");
    expect(entry?.content).toContain("Reply:");
  });

  it("appends to same-topic file when no reply_to given", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    const a = await codex.post({ to: ["claude-code"], content: "第一条", topic: "same-topic" });
    const b = await codex.post({ to: ["claude-code"], content: "第二条", topic: "same-topic" });
    expect(b.fileName).toBe(a.fileName);
    expect(b.id).toBe(a.id);
  });

  it("appends cross-sender to same-topic file", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    const orig = await codex.post({ to: ["kimi"], content: "Codex 起头", topic: "cross-test" });
    // Claude replies on same topic — should append regardless of sender
    const claude = mkSvcOn(repo, clk, "claude-code");
    const reply = await claude.post({ to: ["codex"], content: "Claude 回复", topic: "cross-test" });
    expect(reply.fileName).toBe(orig.fileName);
    expect(reply.id).toBe(orig.id);
  });

  it("creates new file for different topic even from same sender", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    const a = await codex.post({ to: ["claude-code"], content: "x", topic: "topic-a" });
    const b = await codex.post({ to: ["claude-code"], content: "y", topic: "topic-b" });
    expect(b.fileName).not.toBe(a.fileName);
  });

  it("stable sort", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    for (let i = 0; i < 3; i++) await codex.post({ to: ["claude-code"], content: `${i}` });
    const claude = mkSvcOn(repo, clk, "claude-code");
    const names = (await claude.read({ currentAgent: "claude-code", limit: 10 })).entries.map(e => e.fileName);
    expect(names).toEqual([...names].sort());
  });

  it("readOne hides private entries", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    const r = await codex.post({ to: ["kimi"], content: "secret" });
    const claude = mkSvcOn(repo, clk, "claude-code");
    expect(await claude.readOne({ currentAgent: "claude-code", entryId: r.id })).toBeNull();
  });
});
