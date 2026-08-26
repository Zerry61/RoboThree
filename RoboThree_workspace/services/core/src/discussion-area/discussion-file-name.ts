// Discussion file name generation.
//
// Files live in daily folders: 讨论区/YYYYMMDD/
// File names: NNN-<topic>-<agent>.md
//   NNN = daily sequence, 001–999, resets each day
//
// Discussion ID: DISC-YYYYMMDD-NNN-<topic>-<agent>
//   (full date in ID for global uniqueness across days)
//
// Old-format files (with MMDD prefix) are still recognised by
// parseFileName so listing works for historical entries.

import type { Clock } from "../ports/clock.js";
import type { KnownAgentName } from "./agent-name-normalizer.js";

const AGENT_ABBREV: Record<KnownAgentName, string> = {
  "claude-code": "cc", "codex": "cx", "kimi": "ki", "minimax": "mx",
};

export const AGENT_ABBREV_MAP: Readonly<Record<string, string>> = {
  "cc": "claude-code", "cx": "codex", "ki": "kimi", "mx": "minimax",
};

export function agentAbbrev(from: KnownAgentName): string { return AGENT_ABBREV[from]; }
export function agentFromAbbrev(abbrev: string): string | null { return AGENT_ABBREV_MAP[abbrev] ?? null; }

export interface FileNameComponents {
  yyyymmdd: string;
  dailySeq: number;
  topicSlug: string;
  agent: string;
  fileName: string;       // NNN-topic-agent.md
  discussionId: string;   // DISC-YYYYMMDD-NNN-topic-agent
}

const DEFAULT_TOPIC = "note";

export class DiscussionFileNameGenerator {
  readonly #clock: Clock;
  #lastYyyymmdd = "";
  #dailySeq = 0;

  constructor(clock: Clock) { this.#clock = clock; }

  reset(): void { this.#lastYyyymmdd = ""; this.#dailySeq = 0; }

  next(from: KnownAgentName, topic?: string): FileNameComponents {
    const yyyymmdd = parseYyyymmdd(this.#clock.now());
    const abbrev = AGENT_ABBREV[from];
    const topicSlug = topicSlugify(topic);

    if (this.#lastYyyymmdd !== yyyymmdd) {
      this.#lastYyyymmdd = yyyymmdd;
      this.#dailySeq = 1;
    } else {
      this.#dailySeq += 1;
    }

    const nnn = pad(this.#dailySeq, 3);
    const fileName = `${nnn}-${topicSlug}-${abbrev}.md`;
    const discussionId = `DISC-${yyyymmdd}-${nnn}-${topicSlug}-${abbrev}`;

    return { yyyymmdd, dailySeq: this.#dailySeq, topicSlug, agent: abbrev, fileName, discussionId };
  }

  observeExisting(yyyymmdd: string, existingSeq: number): void {
    if (existingSeq < 1 || existingSeq > 999) return;
    if (this.#lastYyyymmdd === "") {
      this.#lastYyyymmdd = yyyymmdd;
      this.#dailySeq = existingSeq;
      return;
    }
    if (this.#lastYyyymmdd === yyyymmdd && existingSeq >= this.#dailySeq) {
      this.#dailySeq = existingSeq;
    }
  }

  todayYyyymmdd(): string {
    return parseYyyymmdd(this.#clock.now());
  }

  // Parse a file name.  Recognises:
  //   New: NNN-topic-agent.md
  //   Old: MMDD-NNN-topic-agent.md (kept for listing historical files)
  static parseFileName(
    fileName: string,
  ): { dailySeq: number; topicSlug: string; abbrev: string } | null {
    // Try new format first: NNN-topic-agent.md
    let match = /^(\d{3})-([a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*?)-([a-z]{2,4})\.md$/u.exec(fileName);
    if (match !== null) {
      const seqRaw = match[1]; const topicSlug = match[2]; const abbrev = match[3];
      if (seqRaw === undefined || topicSlug === undefined || abbrev === undefined) return null;
      const dailySeq = Number.parseInt(seqRaw, 10);
      if (!Number.isFinite(dailySeq) || dailySeq < 1) return null;
      return { dailySeq, topicSlug, abbrev };
    }
    // Fallback: old MMDD-NNN-topic-agent.md
    match = /^\d{4}-(\d{3})-([a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*?)-([a-z]{2,4})\.md$/u.exec(fileName);
    if (match !== null) {
      const seqRaw = match[1]; const topicSlug = match[2]; const abbrev = match[3];
      if (seqRaw === undefined || topicSlug === undefined || abbrev === undefined) return null;
      const dailySeq = Number.parseInt(seqRaw, 10);
      if (!Number.isFinite(dailySeq) || dailySeq < 1) return null;
      return { dailySeq, topicSlug, abbrev };
    }
    return null;
  }
}

export function parseYyyymmdd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO timestamp: ${iso}`);
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

function topicSlugify(topic: string | undefined): string {
  if (topic === undefined || topic.trim().length === 0) return DEFAULT_TOPIC;
  let slug = topic.trim();
  slug = slug.replace(/[\s\u3000]+/gu, "-");
  slug = slug.replace(/[^a-z0-9一-鿿㐀-䶿-]/giu, "");
  slug = slug.replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  if (slug.length === 0) return DEFAULT_TOPIC;
  let len = 0, cut = 0;
  for (const ch of slug) {
    const w = /[一-鿿㐀-䶿]/u.test(ch) ? 2 : 1;
    if (len + w > 20) break;
    len += w; cut += ch.length;
  }
  slug = slug.slice(0, cut).replace(/-$/u, "");
  return slug.length === 0 ? DEFAULT_TOPIC : slug.toLowerCase();
}

function pad(value: number, width: number): string {
  const text = value.toString();
  if (text.length >= width) return text;
  return "0".repeat(width - text.length) + text;
}
