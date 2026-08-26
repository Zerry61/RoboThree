// Markdown serialization for discussion entries.
//
// Each file is a self-contained document with a YAML front-matter
// block followed by a Markdown body. The front matter must round-trip
// for canonical fields (`id`, `from`, `to`, `created_at`, ...). The
// body is treated as opaque Markdown text inside a fenced separator:
// the repository never re-parses the body for decisions, only for
// rendering.
//
// The codec is deliberately a small hand-rolled implementation. Pulling
// in a YAML library would expand the dependency surface for a feature
// that intentionally stays minimal. The front-matter schema only needs
// strings, a string array, and optional fields, which is easy to render
// deterministically and safely.

import type {
  DiscussionEntry,
  DiscussionReadEntry,
} from "./discussion-entry.js";
import {
  validateDiscussionFrontMatter,
  type DiscussionFrontMatterShape,
} from "./discussion-entry.js";

const BODY_SEPARATOR = "\n---\n";
const REQUIRED_FIELDS = ["id", "from", "created_at"] as const;

export interface DiscussionCodecResult {
  body: string;
  parsedFrom: string | null;
}

export class DiscussionMarkdownCodec {
  encode(entry: DiscussionEntry): string {
    const lines: string[] = ["---"];
    lines.push(`id: ${serializeValue(entry.id)}`);
    lines.push(`from: ${serializeValue(entry.from)}`);
    if (entry.to.length === 1) {
      const first = entry.to[0];
      if (first === undefined) {
        throw new Error("Discussion entry must contain at least one target");
      }
      lines.push(`to: ${serializeValue(first)}`);
    } else {
      lines.push("to:");
      for (const target of entry.to) {
        lines.push(`  - ${serializeValue(target)}`);
      }
    }
    if (entry.topic !== undefined) {
      lines.push(`topic: ${serializeValue(entry.topic)}`);
    }
    lines.push(`created_at: ${serializeValue(entry.createdAt)}`);
    if (entry.sourceSession !== undefined) {
      lines.push(`source_session: ${serializeValue(entry.sourceSession)}`);
    }
    if (entry.replyTo !== undefined) {
      lines.push(`reply_to: ${serializeValue(entry.replyTo)}`);
    }
    lines.push("---");
    lines.push("");
    // Normalise CRLF and keep the rest of the bytes intact so the
    // round-trip stays faithful to the caller-supplied string.
    lines.push(entry.content.replace(/\r\n/gu, "\n"));
    // End the file with a single trailing newline so reviewers see
    // clean diffs and shells that loop over Markdown files do not
    // pick up a missing final line.
    return lines.join("\n") + "\n";
  }

  // Decode a file body into a `DiscussionReadEntry`. Front matter
  // decoding tolerates missing optional fields but fails closed when
  // a required field is missing or has the wrong shape — the caller
  // (repository) catches the failure and reports the file as
  // corrupted rather than dropping the whole read.
  decode(fileBody: string, fileName: string): DiscussionReadEntry {
    const parsed = parseFrontMatter(fileBody);
    const front: DiscussionFrontMatterShape = validateDiscussionFrontMatter(parsed.frontMatter, fileName);
    const to: DiscussionReadEntry["to"] = [];
    for (const target of front.to) {
      to.push(target as DiscussionReadEntry["to"][number]);
    }
    const out: DiscussionReadEntry = {
      id: front.id,
      from: front.from,
      to,
      createdAt: front.created_at,
      content: parsed.body,
      fileName,
      ...(front.topic !== undefined ? { topic: front.topic } : {}),
      ...(front.reply_to !== undefined ? { replyTo: front.reply_to } : {}),
    };
    return out;
  }

  // Format a reply section for appending to an existing discussion file.
  formatReply(reply: { from: string; to: string[]; createdAt: string; content: string }): string {
    const toLine = reply.to.join(" → ");
    const header = `Reply: ${reply.from} → ${toLine} @ ${reply.createdAt}`;
    return `${"─".repeat(64)}\n## ${header}\n\n${reply.content.replace(/\r\n/gu, "\n")}`;
  }
}

function serializeValue(value: string): string {
  // Allow only safe characters; reject strings that contain YAML-
  // significant control chars (newline, carriage return) and the YAML
  // list marker at the beginning of a line. The codec intentionally
  // does not support multi-line scalars in v1.
  if (/[\r\n]/u.test(value)) {
    throw new Error(`Cannot serialize multi-line value in YAML scalar field: ${value}`);
  }
  if (value.startsWith("-") || value.startsWith(" ") || value.startsWith("\t")) {
    return JSON.stringify(value);
  }
  const reservedChars = new Set([":", "#", "&", "*", "!", "|", ">", "'", "\"", "%", "@", "`", ",", "{", "}", "[", "]", "\\"]);
  let containsReserved = false;
  for (const ch of value) {
    if (reservedChars.has(ch)) {
      containsReserved = true;
      break;
    }
  }
  if (containsReserved) {
    return JSON.stringify(value);
  }
  return value;
}

interface ParsedFrontMatter {
  frontMatter: Record<string, unknown>;
  body: string;
  parsedFrom: string | null;
}

export function parseFrontMatter(input: string): ParsedFrontMatter {
  const text = input.replace(/\r\n/gu, "\n");
  if (!text.startsWith("---\n")) {
    throw new Error("Missing front matter opening fence");
  }
  const remainder = text.slice(4);
  const closing = remainder.indexOf("\n---\n");
  const closingEnd = closing === -1 ? -1 : closing + 5;
  if (closing === -1 || closingEnd === -1) {
    throw new Error("Missing front matter closing fence");
  }
  const frontText = remainder.slice(0, closing);
  // Discard the single blank line our encoder writes between the
  // closing fence and the body, so authors can compare content
  // directly against the user-supplied string.
  let body = remainder.slice(closingEnd);
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }
  // The file always ends with a trailing newline added by the
  // encoder. Remove it so callers see the same content they handed
  // in. (Content that did end in `\n` retains the trailing newline
  // because we strip the *encoder's* line, not the user's.)
  if (body.endsWith("\n")) {
    body = body.slice(0, -1);
  }
  const entries: Record<string, unknown> = {};
  const lines = frontText.split("\n");
  let pendingKey: string | null = null;
  for (const line of lines) {
    if (pendingKey !== null && line.startsWith("  - ")) {
      const list = entries[pendingKey];
      if (!Array.isArray(list)) {
        throw new Error(`Unexpected list item under non-array key ${pendingKey}`);
      }
      list.push(stripQuotes(line.slice(4).trim()));
      continue;
    }
    pendingKey = null;
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const rawValue = line.slice(colon + 1).trim();
    if (key.length === 0) {
      throw new Error("Empty key in front matter");
    }
    if (rawValue === "") {
      // A bare `key:` line is a list opener; reserve the slot as an
      // empty array so subsequent `  - value` entries can be appended
      // without an array-vs-string type check failing later.
      entries[key] = [];
      pendingKey = key;
      continue;
    }
    entries[key] = stripQuotes(rawValue);
  }
  ensureRequired(entries);
  return {
    frontMatter: entries,
    body,
    parsedFrom: text,
  };
}

function ensureRequired(entries: Record<string, unknown>): void {
  for (const field of REQUIRED_FIELDS) {
    if (entries[field] === undefined || entries[field] === "") {
      throw new Error(`Missing required front matter field: ${field}`);
    }
  }
}

function stripQuotes(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (first === '"' && last === '"') {
      try {
        return JSON.parse(raw) as string;
      } catch {
        return raw.slice(1, -1);
      }
    }
    if (first === "'" && last === "'") {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

export function bodySeparator(): string {
  return BODY_SEPARATOR;
}
