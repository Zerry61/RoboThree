import { describe, expect, it } from "vitest";
import { DiscussionMarkdownCodec, type DiscussionEntry } from "../../src/index.js";

function mk(overrides: Partial<DiscussionEntry> = {}): DiscussionEntry {
  const base: DiscussionEntry = {
    id: "DISC-20260725-001-kaf-50-cx", from: "codex", to: ["claude-code"],
    createdAt: "2026-07-25T15:30:45.000+08:00",
    content: "正文。\n- item one\n- item two",
    fileName: "001-kaf-50-cx.md", filePath: "/tmp/x/20260725/001-kaf-50-cx.md",
  };
  return { ...base, ...overrides };
}

describe("DiscussionMarkdownCodec", () => {
  const c = new DiscussionMarkdownCodec();

  it("round-trips with optional fields", () => {
    const e = mk({ topic: "KAF-5.0", sourceSession: "s1", replyTo: "DISC-0725-001-other-cx" });
    const d = c.decode(c.encode(e), e.fileName);
    expect(d.id).toBe(e.id);
    expect(d.topic).toBe("KAF-5.0");
    expect(d.replyTo).toBe("DISC-0725-001-other-cx");
    expect(d.content).toBe(e.content);
  });

  it("hand-written file decodes correctly", () => {
    const raw = ["---", "id: DISC-0725-001-kaf-50-cx", "from: codex", "to:", "  - claude-code", "  - kimi",
      "topic: KAF-5.0", "created_at: 2026-07-25T15:30:45.000+08:00", "---", "", "# Title", "", "body"].join("\n");
    const d = c.decode(raw, "0725-001-kaf-50-cx.md");
    expect(d.to).toEqual(["claude-code", "kimi"]);
    expect(d.content).toContain("# Title");
  });

  it("formatReply produces thread separator + header", () => {
    const reply = c.formatReply({
      from: "claude-code", to: ["codex"],
      createdAt: "2026-07-25T16:00:00+08:00",
      content: "回复内容",
    });
    expect(reply).toContain("## Reply: claude-code → codex @ 2026-07-25T16:00:00+08:00");
    expect(reply).toContain("回复内容");
    expect(reply).toMatch(/^─{64}/u);
  });

  it("fails closed on missing id", () => {
    expect(() => c.decode("---\nfrom: codex\ncreated_at: 2026-07-25T15:30:45+08:00\n---\n", "x.md")).toThrow();
  });
});
