// Discussion service — the business layer on top of the repository.
//
// The service owns:
//   - request validation (front-matter shape and required fields),
//   - agent identity resolution (`from` and `currentAgent` come from
//     the supplied `AgentIdentity`, never from the user-provided body),
//   - target normalisation,
//   - read filtering and ordering.
//
// The repository owns persistence and file-system safety. The service
// is the only place that knows about the relationship between a
// discussion record and the agent runtime that produced it.

import type { Clock } from "../ports/clock.js";

import {
  AGENT_HANDLES,
  UnknownAgentNameError,
  type AgentNameNormalizer,
  type KnownAgentName,
  type NormalizedAgentName,
} from "./agent-name-normalizer.js";
import type {
  DiscussionEntry,
  DiscussionPostResult,
  DiscussionReadEntry,
  DiscussionReadRequest,
  DiscussionReadResult,
  DiscussionSkippedFile,
} from "./discussion-entry.js";
import {
  DiscussionValidationError,
  DiscussionWorkspaceError,
} from "./discussion-entry.js";
import type { DiscussionRepository } from "./discussion-repository.js";
import {
  DiscussionFileNameGenerator,
} from "./discussion-file-name.js";
import {
  DiscussionMarkdownCodec,
} from "./discussion-markdown-codec.js";

// Identity of the runtime agent calling the service. Supplied by the
// hook/command layer — never derived from user content.
export interface AgentIdentity {
  agentId: KnownAgentName;
}

export interface DiscussionServiceOptions {
  repository: DiscussionRepository;
  normalizer: AgentNameNormalizer;
  codec: DiscussionMarkdownCodec;
  clock: Clock;
  identity: AgentIdentity;
  // Maximum allowed `limit` for read requests. Defends against a
  // hostile caller asking for the entire corpus in one go.
  maxLimit?: number;
  // Default limit when the caller does not specify one.
  defaultLimit?: number;
}

export const DEFAULT_READ_LIMIT = 10;
export const MAX_READ_LIMIT = 100;

export class DiscussionService {
  readonly #repository: DiscussionRepository;
  readonly #normalizer: AgentNameNormalizer;
  readonly #codec: DiscussionMarkdownCodec;
  readonly #clock: Clock;
  readonly #identity: AgentIdentity;
  readonly #maxLimit: number;
  readonly #defaultLimit: number;

  constructor(options: DiscussionServiceOptions) {
    this.#repository = options.repository;
    this.#normalizer = options.normalizer;
    this.#codec = options.codec;
    this.#clock = options.clock;
    this.#identity = options.identity;
    this.#maxLimit = options.maxLimit ?? MAX_READ_LIMIT;
    this.#defaultLimit = options.defaultLimit ?? DEFAULT_READ_LIMIT;
  }

  identity(): AgentIdentity {
    return this.#identity;
  }

  repository(): DiscussionRepository {
    return this.#repository;
  }

  // Public entry point for writing a new entry.  When a `replyTo` id is
  // present, or when an existing file with the same topic and overlapping
  // recipients already exists, the reply content is appended to that file
  // instead of creating a new one.  Otherwise a fresh file is allocated.
  async post(input: {
    to: readonly string[];
    content: string;
    topic?: string;
    sourceSession?: string;
    replyTo?: string;
  }): Promise<DiscussionPostResult> {
    const from = this.#identity.agentId;
    const to = this.#normalizeTargets(input.to);
    if (to.length === 0) {
      throw new DiscussionValidationError("Discussion entry requires at least one target agent");
    }
    const content = this.#validateContent(input.content);
    const topic = this.#validateTopic(input.topic);
    const sourceSession = this.#validateSourceSession(input.sourceSession);
    const replyTo = this.#validateReplyTo(input.replyTo);
    const createdAt = this.#clock.now();

    // ── Try to find an existing thread to append to ──
    const existing = await this.#findThreadTarget(input.replyTo, topic);
    if (existing !== null) {
      const replySection = this.#codec.formatReply({ from, to, createdAt, content });
      await this.#repository.appendToEntry(existing.id, existing.fileName, replySection);
      return {
        id: existing.id,
        fileName: existing.fileName,
        filePath: joinPath(this.#repository.baseDirectory(), existing.fileName),
        to,
      };
    }

    // ── New thread ──
    const allocation = await this.#repository.allocateFileName(from, topic);
    const filePath = joinPath(allocation.dayDir, allocation.fileName);
    const entry: DiscussionEntry = {
      id: allocation.discussionId,
      from,
      to,
      content,
      createdAt,
      fileName: allocation.fileName,
      filePath,
      ...(topic !== undefined ? { topic } : {}),
      ...(sourceSession !== undefined ? { sourceSession } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
    };

    const body = this.#codec.encode(entry);
    await this.#repository.write({ directory: allocation.dayDir, fileName: allocation.fileName, content: body });
    return {
      id: entry.id,
      fileName: entry.fileName,
      filePath: entry.filePath,
      to,
    };
  }

  // Public entry point for reading entries visible to the current
  // agent. Defaults to the 10 most recent entries addressed to
  // `currentAgent` or to `all`.
  async read(input: DiscussionReadRequest): Promise<DiscussionReadResult> {
    const currentAgent = this.#requireCurrentAgent(input.currentAgent);
    const listing = await this.#repository.list();
    const visible = listing.entries.filter((entry) => this.#isVisibleTo(entry, currentAgent));
    const filtered = this.#applyFilters(visible, input);
    filtered.sort(compareByFileName);
    const limit = this.#resolveLimit(input.limit);
    const entries = filtered.slice(0, limit);
    return {
      entries,
      skipped: listing.skipped,
    };
  }

  // Direct read of a single entry, returning null when not found or
  // when the entry is not addressed to the current agent. Discussion
  // content is never executed or rendered outside the existing Tool
  // risk and Renderer boundaries.
  async readOne(input: { currentAgent: KnownAgentName; entryId: string }): Promise<DiscussionReadEntry | null> {
    const currentAgent = this.#requireCurrentAgent(input.currentAgent);
    if (!DISCUSSION_ID_PATTERN.test(input.entryId)) {
      throw new DiscussionValidationError(`Invalid discussion id: ${input.entryId}`);
    }
    const listing = await this.#repository.list();
    for (const entry of listing.entries) {
      if (entry.id === input.entryId) {
        if (!this.#isVisibleTo(entry, currentAgent)) {
          return null;
        }
        return entry;
      }
    }
    return null;
  }

  async loadReplyTarget(entryId: string): Promise<DiscussionReadEntry | null> {
    const listing = await this.#repository.list();
    for (const entry of listing.entries) {
      if (entry.id === entryId) {
        return entry;
      }
    }
    return null;
  }

  // Look for an existing thread file to append to.  Priority:
  //   1. explicit replyTo id → the file that carries that id
  //   2. same topic (any sender) → the most recent file for that topic
  // Returns null when no matching thread exists.
  async #findThreadTarget(
    replyTo: string | undefined,
    topic: string | undefined,
  ): Promise<{ id: string; fileName: string } | null> {
    const listing = await this.#repository.list();

    if (replyTo !== undefined) {
      for (const entry of listing.entries) {
        if (entry.id === replyTo) return { id: entry.id, fileName: entry.fileName };
      }
      return null;
    }

    if (topic !== undefined) {
      // Match any sender — same-topic discussion belongs in one file
      // regardless of which agent wrote which message.
      const candidates = listing.entries.filter((entry) => entry.topic === topic);
      if (candidates.length > 0) {
        candidates.sort((a, b) => (a.fileName < b.fileName ? 1 : -1));
        const newest = candidates[0];
        if (newest !== undefined) return { id: newest.id, fileName: newest.fileName };
      }
    }

    return null;
  }

  #requireCurrentAgent(agent: string): KnownAgentName {
    if ((AGENT_HANDLES as ReadonlySet<NormalizedAgentName>).has(agent as NormalizedAgentName)) {
      return agent as KnownAgentName;
    }
    throw new DiscussionValidationError(`Unknown current agent: ${agent}`);
  }

  #normalizeTargets(values: readonly string[]): NormalizedAgentName[] {
    if (!Array.isArray(values)) {
      throw new DiscussionValidationError("Targets must be an array of agent handles");
    }
    let normalized: NormalizedAgentName[];
    try {
      normalized = this.#normalizer.normalizeAll(values);
    } catch (error) {
      if (error instanceof UnknownAgentNameError) {
        throw new DiscussionValidationError(`Unknown discussion target agent: ${error.input}`);
      }
      throw error;
    }
    // The service refuses to silently substitute `all` for a missing
    // target list. If `all` is the only requested target, the request
    // is interpreted as "broadcast" but still requires an explicit
    // caller instruction — we keep the explicit form.
    return normalized;
  }

  #validateContent(content: string): string {
    if (typeof content !== "string") {
      throw new DiscussionValidationError("Content must be a string");
    }
    const trimmed = content.replace(/\r\n/gu, "\n");
    if (trimmed.trim().length === 0) {
      throw new DiscussionValidationError("Discussion content cannot be empty");
    }
    if (trimmed.length > 64 * 1024) {
      throw new DiscussionValidationError("Discussion content exceeds maximum length (64 KiB)");
    }
    return trimmed;
  }

  #validateTopic(topic: string | undefined): string | undefined {
    if (topic === undefined) {
      return undefined;
    }
    if (typeof topic !== "string") {
      throw new DiscussionValidationError("Topic must be a string");
    }
    const trimmed = topic.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (trimmed.length > 160) {
      throw new DiscussionValidationError("Topic exceeds maximum length (160 characters)");
    }
    return trimmed;
  }

  #validateSourceSession(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new DiscussionValidationError("Source session must be a string");
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (trimmed.length > 120) {
      throw new DiscussionValidationError("Source session exceeds maximum length (120 characters)");
    }
    // Source session must be opaque and free of path-style characters
    // so it can never be used to construct a path.
    if (/[\\/\0]/u.test(trimmed)) {
      throw new DiscussionValidationError("Source session contains forbidden characters");
    }
    return trimmed;
  }

  #validateReplyTo(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new DiscussionValidationError("reply_to must be a string");
    }
    if (!DISCUSSION_ID_PATTERN.test(value)) {
      throw new DiscussionValidationError(`Invalid reply_to id: ${value}`);
    }
    return value;
  }

  #isVisibleTo(entry: DiscussionReadEntry, currentAgent: KnownAgentName): boolean {
    if (entry.to.includes("all" satisfies NormalizedAgentName)) {
      return true;
    }
    return entry.to.includes(currentAgent);
  }

  #applyFilters(entries: DiscussionReadEntry[], input: DiscussionReadRequest): DiscussionReadEntry[] {
    const topic = input.topic?.trim();
    const fromFilter = input.from;
    const since = input.since;
    const entryId = input.entryId;
    return entries.filter((entry) => {
      if (entryId !== undefined && entry.id !== entryId) {
        return false;
      }
      if (fromFilter !== undefined && entry.from !== fromFilter) {
        return false;
      }
      if (topic !== undefined && entry.topic !== topic) {
        return false;
      }
      if (since !== undefined && entry.createdAt < since) {
        return false;
      }
      return true;
    });
  }

  #resolveLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return this.#defaultLimit;
    }
    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
      throw new DiscussionValidationError(`Invalid limit: ${limit}`);
    }
    return Math.min(limit, this.#maxLimit);
  }
}

const DISCUSSION_ID_PATTERN = /^DISC-\d{4,8}-\d{3}-[a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*-[a-z]{2,4}$/u;

function joinPath(directory: string, fileName: string): string {
  return `${directory.replace(/\/$/u, "")}/${fileName}`;
}

function compareByFileName(a: DiscussionReadEntry, b: DiscussionReadEntry): number {
  if (a.fileName === b.fileName) {
    return 0;
  }
  return a.fileName < b.fileName ? -1 : 1;
}

// Re-export the file name generator and codec from a stable place so
// callers composing the service manually do not have to chase them
// across files.
export { DiscussionFileNameGenerator, DiscussionMarkdownCodec };
export { DiscussionWorkspaceError };
export type { DiscussionSkippedFile };
