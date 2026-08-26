import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../src/ports/clock.js";
import {
  AgentNameNormalizer, DiscussionHook, DiscussionMarkdownCodec,
  DiscussionRepository, DiscussionService, DiscussionValidationError,
} from "../../src/index.js";

class StepClock implements Clock {
  constructor(private d: Date, private step = 1) {}
  now(): string { const r = this.d; this.d = new Date(this.d.getTime() + this.step); return r.toISOString(); }
}
const ISO = "2026-07-22T15:30:45.000+08:00";

function mkSvcOn(repo: DiscussionRepository, clk: Clock, agent: "codex" | "claude-code" | "kimi" | "minimax") {
  return new DiscussionService({
    repository: repo, normalizer: new AgentNameNormalizer(),
    codec: new DiscussionMarkdownCodec(), clock: clk, identity: { agentId: agent },
  });
}

describe("DiscussionHook", () => {
  let ws = "", repo: DiscussionRepository, clk: StepClock;

  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "r3-disc-hk-"));
    await mkdir(join(ws, "讨论区"), { recursive: true });
    clk = new StepClock(new Date(ISO), 5000);
    repo = new DiscussionRepository(clk, { directory: join(ws, "讨论区"), workspaceRoot: ws });
  });
  afterEach(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });

  it("parses structured post", () => {
    const svc = mkSvcOn(repo, clk, "codex");
    const a = new DiscussionHook(svc).parse("/discussion post @claude-code @kimi --topic KAF -- 结论");
    expect(a.type).toBe("post");
    if (a.type === "post") {
      expect(a.request.to).toEqual(["claude-code", "kimi"]);
      expect(a.request.topic).toBe("KAF");
      expect(a.request.from).toBe("codex");
    }
  });

  it("parses Chinese post", () => {
    const svc = mkSvcOn(repo, clk, "codex");
    const a = new DiscussionHook(svc).parse("把关于 KAF-5.0 的结论记录到讨论区，@Claude Code 和 @Kimi。");
    expect(a.type).toBe("post");
  });

  it("parses Chinese read", () => {
    const svc = mkSvcOn(repo, clk, "claude-code");
    const a = new DiscussionHook(svc).parse("读取讨论区里 @claude-code 关于 ADR 的最近 3 条。");
    expect(a.type).toBe("read");
  });

  it("refuses broadcast without target", () => {
    const svc = mkSvcOn(repo, clk, "codex");
    expect(() => new DiscussionHook(svc).parse("把内容记录到讨论区。")).toThrow(DiscussionValidationError);
  });

  it("invoke post → file created", async () => {
    const svc = mkSvcOn(repo, clk, "codex");
    const r = await new DiscussionHook(svc).invoke("/discussion post @kimi --topic test -- hello");
    expect(r.type).toBe("posted");
    if (r.type === "posted") expect(r.result.fileName).toMatch(/^\d{3}-test-/u);
  });

  it("invoke read → only own entries", async () => {
    const codex = mkSvcOn(repo, clk, "codex");
    await codex.post({ to: ["claude-code"], content: "x", topic: "t1" });
    await codex.post({ to: ["codex"], content: "y", topic: "t2" });
    // Re-read as codex — should see only t2
    const r = await new DiscussionHook(codex).invoke("读取讨论区里 @codex 的最新内容");
    expect(r.type).toBe("read");
    if (r.type === "read") expect(r.result.entries.length).toBe(1);
  });
});
