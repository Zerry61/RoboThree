// Domain types for the workspace discussion area.
//
// The discussion area stores each record as a single immutable
// Markdown file with YAML front matter. These types are the in-memory
// representation used by the service and hook layers. The on-disk
// contract is owned by `discussion-markdown-codec.ts`.
//
// Front-matter validation is intentionally lax here — `from`/`to`
// values are re-checked against `AgentNameNormalizer` inside the
// service before they can be persisted, so that user-supplied data
// cannot impersonate an agent.

import type { KnownAgentName, NormalizedAgentName } from "./agent-name-normalizer.js";

// DISC-YYYYMMDD-NNN-<topic>-<agent> (new) or DISC-MMDD-NNN-... (old)
export const DISCUSSION_ID_PATTERN = /^DISC-\d{4,8}-\d{3}-[a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*-[a-z]{2,4}$/u;
// NNN-<topic>-<agent>.md (new) or MMDD-NNN-<topic>-<agent>.md (old)
export const DISCUSSION_FILE_NAME_PATTERN = /^(?:\d{4}-)?\d{3}-[a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*-[a-z]{2,4}\.md$/u;

export interface DiscussionFrontMatterShape {
  id: string;
  from: string;
  to: string[];
  topic?: string;
  created_at: string;
  source_session?: string;
  reply_to?: string;
}

export interface DiscussionEntry {
  id: string;
  from: KnownAgentName;
  to: NormalizedAgentName[];
  topic?: string;
  createdAt: string;
  sourceSession?: string;
  replyTo?: string;
  content: string;
  fileName: string;
  filePath: string;
}

export interface DiscussionPostRequest {
  from: KnownAgentName;
  to: NormalizedAgentName[];
  topic?: string;
  content: string;
  sourceSession?: string;
  replyTo?: string;
}

export interface DiscussionReadRequest {
  currentAgent: KnownAgentName;
  topic?: string;
  from?: KnownAgentName;
  limit?: number;
  since?: string;
  entryId?: string;
}

export interface DiscussionPostResult {
  id: string;
  fileName: string;
  filePath: string;
  to: NormalizedAgentName[];
}

export interface DiscussionReadEntry {
  id: string;
  from: KnownAgentName | string;
  to: NormalizedAgentName[];
  topic?: string;
  createdAt: string;
  replyTo?: string;
  content: string;
  fileName: string;
}

export interface DiscussionSkippedFile {
  fileName: string;
  reason: string;
}

export interface DiscussionReadResult {
  entries: DiscussionReadEntry[];
  skipped: ReadonlyArray<DiscussionSkippedFile>;
}

export class DiscussionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscussionValidationError";
  }
}

export class DiscussionWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscussionWorkspaceError";
  }
}

export function validateDiscussionFrontMatter(
  input: unknown,
  fileName: string,
): DiscussionFrontMatterShape {
  if (typeof input !== "object" || input === null) {
    throw new Error(`Front matter must be an object (${fileName})`);
  }
  const record = input as Record<string, unknown>;
  const id = requireString(record.id, "id", fileName);
  if (!DISCUSSION_ID_PATTERN.test(id)) {
    throw new Error(`Front matter id must match DISC pattern (${fileName})`);
  }
  const from = requireString(record.from, "from", fileName);
  const createdAt = requireString(record.created_at, "created_at", fileName);
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`Front matter created_at must be ISO-8601 (${fileName})`);
  }
  let toValues: unknown[];
  if (Array.isArray(record.to)) {
    toValues = record.to;
  } else if (typeof record.to === "string" && record.to.length > 0) {
    // Single-target form (`to: claude-code`) is legal YAML; coerce to
    // a one-element list so the in-memory representation stays
    // uniform across writers and hand-authored files.
    toValues = [record.to];
  } else {
    throw new Error(`Front matter to must be a list (${fileName})`);
  }
  const to: string[] = [];
  for (const [index, value] of toValues.entries()) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Front matter to[${index}] must be a non-empty string (${fileName})`);
    }
    to.push(value);
  }
  if (to.length === 0) {
    throw new Error(`Front matter to must contain at least one target (${fileName})`);
  }
  const topic = optionalString(record.topic, "topic", fileName);
  const sourceSession = optionalString(record.source_session, "source_session", fileName);
  let replyTo: string | undefined;
  if (record.reply_to !== undefined) {
    if (typeof record.reply_to !== "string" || !DISCUSSION_ID_PATTERN.test(record.reply_to)) {
      throw new Error(`Front matter reply_to must match DISC pattern (${fileName})`);
    }
    replyTo = record.reply_to;
  }
  const out: DiscussionFrontMatterShape = {
    id,
    from,
    to,
    created_at: createdAt,
    ...(topic !== undefined ? { topic } : {}),
    ...(sourceSession !== undefined ? { source_session: sourceSession } : {}),
    ...(replyTo !== undefined ? { reply_to: replyTo } : {}),
  };
  return out;
}

function requireString(value: unknown, name: string, fileName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Front matter ${name} must be a non-empty string (${fileName})`);
  }
  return value;
}

function optionalString(value: unknown, name: string, fileName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Front matter ${name} must be a string when present (${fileName})`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}
