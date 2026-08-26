// Agent name normalization for the workspace discussion area.
//
// The first version only recognises a fixed allow-list of agent handles
// (codex, claude-code, kimi, minimax, all). Anything outside the
// allow-list is rejected so discussion content cannot be used to
// impersonate other agents or to address non-existent handles.
//
// "All" is only ever produced when a caller explicitly invokes the
// `all` handle. The post service refuses to silently substitute `all`
// for a missing target list — it raises a typed error instead.

const KNOWN_AGENTS = new Set(["codex", "claude-code", "kimi", "minimax"] as const);

export type KnownAgentName = "codex" | "claude-code" | "kimi" | "minimax";
export const ALL_AGENT = "all" as const;
export type NormalizedAgentName = KnownAgentName | typeof ALL_AGENT;

const ALIAS_MAP: ReadonlyMap<string, NormalizedAgentName> = new Map([
  ["codex", "codex"],
  ["claude-code", "claude-code"],
  ["claude", "claude-code"],
  ["claudecode", "claude-code"],
  ["claude code", "claude-code"],
  ["kimi", "kimi"],
  ["kimi code", "kimi"],
  ["kimicode", "kimi"],
  ["minimax", "minimax"],
  ["mini max", "minimax"],
  ["minimax code", "minimax"],
  ["minimaxcode", "minimax"],
  ["all", ALL_AGENT],
  ["everyone", ALL_AGENT],
]);

export class UnknownAgentNameError extends Error {
  readonly #input: string;

  constructor(input: string) {
    super(`Unknown agent name: ${input}`);
    this.name = "UnknownAgentNameError";
    this.#input = input;
  }

  get input(): string {
    return this.#input;
  }
}

export class AgentNameNormalizer {
  // Normalize a free-form agent handle into a canonical, allow-listed
  // name. Throws when the input cannot be mapped to a known handle.
  normalize(raw: string): NormalizedAgentName {
    if (typeof raw !== "string") {
      throw new UnknownAgentNameError(String(raw));
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new UnknownAgentNameError(raw);
    }
    const folded = trimmed.toLowerCase();
    // Strip a single leading "@", which is how users typically address
    // agents inline. Other punctuation must not be silently stripped
    // because it could be part of a spoofed handle.
    const withoutMentionPrefix = folded.startsWith("@") ? folded.slice(1) : folded;
    const mapped = ALIAS_MAP.get(withoutMentionPrefix);
    if (mapped !== undefined) {
      return mapped;
    }
    if ((KNOWN_AGENTS as ReadonlySet<string>).has(withoutMentionPrefix)) {
      return withoutMentionPrefix as KnownAgentName;
    }
    throw new UnknownAgentNameError(raw);
  }

  // Normalize a list of agent handles, deduplicating while preserving
  // order. Throws on the first unknown value.
  normalizeAll(values: readonly string[]): NormalizedAgentName[] {
    if (!Array.isArray(values)) {
      throw new UnknownAgentNameError("not-an-array");
    }
    const seen = new Set<NormalizedAgentName>();
    const out: NormalizedAgentName[] = [];
    for (const value of values) {
      const normalized = this.normalize(value);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(normalized);
    }
    if (out.length === 0) {
      throw new UnknownAgentNameError("empty-target-list");
    }
    return out;
  }

  isKnown(value: string): boolean {
    return this.normalizeOrNull(value) !== null;
  }

  normalizeOrNull(value: string): NormalizedAgentName | null {
    try {
      return this.normalize(value);
    } catch (error) {
      if (error instanceof UnknownAgentNameError) {
        return null;
      }
      throw error;
    }
  }
}

export const AGENT_HANDLES: ReadonlySet<NormalizedAgentName> = new Set([
  ...KNOWN_AGENTS,
  ALL_AGENT,
] as NormalizedAgentName[]);
