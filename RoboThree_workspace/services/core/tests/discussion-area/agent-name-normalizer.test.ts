import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_HANDLES,
  AgentNameNormalizer,
  UnknownAgentNameError,
} from "../../src/index.js";

describe("AgentNameNormalizer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalises known agent handles regardless of casing", () => {
    const normalizer = new AgentNameNormalizer();
    expect(normalizer.normalize("Codex")).toBe("codex");
    expect(normalizer.normalize("claude code")).toBe("claude-code");
    expect(normalizer.normalize("claude-code")).toBe("claude-code");
    expect(normalizer.normalize("Kimi")).toBe("kimi");
  });

  it("strips a single leading @ marker", () => {
    const normalizer = new AgentNameNormalizer();
    expect(normalizer.normalize("@claude-code")).toBe("claude-code");
    expect(normalizer.normalize("@kimi")).toBe("kimi");
  });

  it("normalises minimax aliases", () => {
    const normalizer = new AgentNameNormalizer();
    expect(normalizer.normalize("minimax")).toBe("minimax");
    expect(normalizer.normalize("Mini Max")).toBe("minimax");
    expect(normalizer.normalize("Minimax Code")).toBe("minimax");
    expect(normalizer.normalize("@minimax")).toBe("minimax");
  });

  it("resolves 'all' and 'everyone' to the broadcast handle", () => {
    const normalizer = new AgentNameNormalizer();
    expect(normalizer.normalize("all")).toBe("all");
    expect(normalizer.normalize("everyone")).toBe("all");
    expect(normalizer.normalize("@all")).toBe("all");
  });

  it("throws UnknownAgentNameError on unknown handles", () => {
    const normalizer = new AgentNameNormalizer();
    expect(() => normalizer.normalize("assistant")).toThrow(UnknownAgentNameError);
    expect(() => normalizer.normalize("")).toThrow(UnknownAgentNameError);
  });

  it("deduplicates and preserves order when normalising lists", () => {
    const normalizer = new AgentNameNormalizer();
    const out = normalizer.normalizeAll(["@kimi", "Claude Code", "kimi", "all", "everyone"]);
    expect(out).toEqual(["kimi", "claude-code", "all"]);
  });

  it("rejects non-array inputs and empty lists", () => {
    const normalizer = new AgentNameNormalizer();
    // @ts-expect-error exercising runtime guard
    expect(() => normalizer.normalizeAll(undefined)).toThrow(UnknownAgentNameError);
    expect(() => normalizer.normalizeAll([])).toThrow(UnknownAgentNameError);
  });

  it("exposes the canonical known-handle set", () => {
    expect([...AGENT_HANDLES].sort()).toEqual(["all", "claude-code", "codex", "kimi", "minimax"]);
  });
});
