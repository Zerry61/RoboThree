import { describe, expect, it } from "vitest";
import type { Clock } from "../../src/ports/clock.js";
import { DiscussionFileNameGenerator, agentAbbrev } from "../../src/index.js";

class SeqClock implements Clock {
  #ts: string[]; #i = 0;
  constructor(ts: string[]) { this.#ts = ts; }
  now(): string { const v = this.#ts[this.#i]; if (!v) throw new Error("exhausted"); this.#i += 1; return v; }
}
function iso(d: Date) { return d.toISOString(); }
const JUL25 = iso(new Date("2026-07-25T15:30:45+08:00"));

describe("DiscussionFileNameGenerator", () => {
  it("builds NNN-topic-agent.md with daily seq 001", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25]));
    const c = g.next("codex", "KAF-5.0");
    expect(c.fileName).toBe("001-kaf-50-cx.md");
    expect(c.discussionId).toBe("DISC-20260725-001-kaf-50-cx");
    expect(c.dailySeq).toBe(1);
  });

  it("defaults topic to note", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25]));
    const c = g.next("claude-code");
    expect(c.fileName).toBe("001-note-cc.md");
  });

  it("slugifies Chinese topic", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25]));
    expect(g.next("kimi", "讨论区上线").fileName).toBe("001-讨论区上线-ki.md");
  });

  it("agent abbreviations", () => {
    expect(agentAbbrev("codex")).toBe("cx");
    expect(agentAbbrev("claude-code")).toBe("cc");
    expect(agentAbbrev("kimi")).toBe("ki");
    expect(agentAbbrev("minimax")).toBe("mx");
  });

  it("increments daily sequence", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25, JUL25, JUL25]));
    expect(g.next("codex", "test").dailySeq).toBe(1);
    expect(g.next("codex", "test").dailySeq).toBe(2);
    expect(g.next("claude-code", "other").dailySeq).toBe(3);
  });

  it("resets daily sequence on new day", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25, JUL25, iso(new Date("2026-07-26T10:00:00+08:00"))]));
    g.next("codex", "test");
    expect(g.next("codex", "test").dailySeq).toBe(2);
    expect(g.next("codex", "test").dailySeq).toBe(1);
  });

  it("parseFileName handles new format", () => {
    expect(DiscussionFileNameGenerator.parseFileName("001-kaf-50-cx.md"))
      .toEqual({ dailySeq: 1, topicSlug: "kaf-50", abbrev: "cx" });
    expect(DiscussionFileNameGenerator.parseFileName("042-test-cc.md"))
      .toEqual({ dailySeq: 42, topicSlug: "test", abbrev: "cc" });
  });

  it("parseFileName handles old MMDD-NNN-... format", () => {
    expect(DiscussionFileNameGenerator.parseFileName("0725-001-kaf-50-cx.md"))
      .toEqual({ dailySeq: 1, topicSlug: "kaf-50", abbrev: "cx" });
  });

  it("parseFileName rejects bad inputs", () => {
    expect(DiscussionFileNameGenerator.parseFileName("")).toBeNull();
    expect(DiscussionFileNameGenerator.parseFileName("abc.md")).toBeNull();
  });

  it("observeExisting advances daily counter", () => {
    const g = new DiscussionFileNameGenerator(new SeqClock([JUL25, JUL25]));
    expect(g.next("codex", "a").dailySeq).toBe(1);
    g.observeExisting("20260725", 5);
    expect(g.next("codex", "b").dailySeq).toBe(6);
  });
});
