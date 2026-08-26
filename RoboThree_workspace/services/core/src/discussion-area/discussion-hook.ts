// Discussion hook adapter — narrows user intent into the two actions
// the discussion area actually supports in v1: "post a note" and
// "read notes addressed to me". The hook is *not* a general-purpose
// NLP router; it parses a deliberately constrained command grammar
// and forwards everything else to the caller as `unrecognized`.
//
// The hook is the smallest possible seam between natural-language
// requests and the discussion service. Anything more elaborate —
// fuzzy mention detection, cross-agent discovery, automatic replies,
// broadcasting — is intentionally out of scope per the brief.
//
// Two commands are recognised:
//
//   /discussion post | @<agent> [<agent> ...] [--topic <topic>]
//                [--reply-to <DISC-id>] [--source-session <id>]
//                -- <content lines...>
//
//   /discussion read [@<agent>] [--topic <topic>] [--from <agent>]
//                [--limit <n>] [--since <iso>] [--entry <DISC-id>]
//
// Markdown-friendly shorthand is also accepted in the natural-language
// form ("把刚才关于 ... 的结论记录到讨论区，@Claude Code 和 @Kimi。");
// details live in `parsePostIntent` and `parseReadIntent`. Each
// helper returns structured findings or `null` when the intent cannot
// be classified. The hook itself decides whether to dispatch.

import type { KnownAgentName, NormalizedAgentName } from "./agent-name-normalizer.js";
import {
  AgentNameNormalizer,
} from "./agent-name-normalizer.js";
import type {
  DiscussionPostRequest,
  DiscussionReadRequest,
  DiscussionPostResult,
  DiscussionReadResult,
} from "./discussion-entry.js";
import { DiscussionValidationError } from "./discussion-entry.js";
import type {
  AgentIdentity,
  DiscussionService,
} from "./discussion-service.js";

export type DiscussionHookAction =
  | { type: "post"; request: DiscussionPostRequest }
  | { type: "read"; request: DiscussionReadRequest };

export interface DiscussionHookResult {
  action: DiscussionHookAction;
  // The original input, retained only for the caller's audit log and
  // never echoed back into the discussion content.
  rawInput: string;
}

export interface DiscussionHookContext {
  agent: AgentIdentity;
}

const MENTION_PATTERN = /(^|[\s、。，！？,.;。、，;!?])@([A-Za-z][\w-]*)/gu;
const COMMAND_PATTERN = /^\s*\/discussion\s+(?<verb>post|read)\b(?<rest>.*)$/u;

export class DiscussionHook {
  readonly #service: DiscussionService;
  readonly #normalizer: AgentNameNormalizer;
  readonly #identity: AgentIdentity;

  constructor(service: DiscussionService) {
    this.#service = service;
    this.#normalizer = new AgentNameNormalizer();
    this.#identity = service.identity();
  }

  service(): DiscussionService {
    return this.#service;
  }

  // Translate a free-form user message into a discussion action.
  // Throws when the intent looks like an attempt to spoof the agent
  // identity (the body tries to claim to be a different agent).
  parse(input: string): DiscussionHookAction {
    if (typeof input !== "string") {
      throw new DiscussionValidationError("Hook input must be a string");
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new DiscussionValidationError("Hook input cannot be empty");
    }

    const commandMatch = COMMAND_PATTERN.exec(trimmed);
    if (commandMatch !== null) {
      const groups = commandMatch.groups;
      if (groups === undefined) {
        throw new DiscussionValidationError("Unable to parse /discussion command");
      }
      const verb = groups.verb;
      const rest = groups.rest ?? "";
      if (verb === "post") {
        return { type: "post", request: parseCommandPost(rest, this.#identity, this.#normalizer).request };
      }
      if (verb === "read") {
        return { type: "read", request: parseCommandRead(rest, this.#identity, this.#normalizer).request };
      }
    }

    // Natural-language form: classify by leading verb and presence
    // of agent mentions. We never infer `to` without an `@<agent>`
    // mention because silently broadcasting is forbidden.
    const mentions = collectMentions(trimmed, this.#normalizer);
    if (hasPostVerb(trimmed) && mentions.length > 0) {
      const request = buildPostRequest(trimmed, mentions, this.#identity, this.#normalizer);
      if (request !== null) {
        return { type: "post", request };
      }
    }
    if (hasReadVerb(trimmed) && mentions.includes(this.#identity.agentId)) {
      const request = buildReadRequest(trimmed, mentions, this.#identity, this.#normalizer);
      if (request !== null) {
        return { type: "read", request };
      }
    }
    throw new DiscussionValidationError("Hook input is not a recognisable discussion action");
  }

  // Convenience: parse + dispatch. Returns the posted `id`/`file`
  // path, or the list of read entries.
  async invoke(input: string): Promise<DiscussionHookResultDispatch> {
    const action = this.parse(input);
    if (action.type === "post") {
      const result = await this.#service.post({
        to: action.request.to,
        content: action.request.content,
        ...(action.request.topic !== undefined ? { topic: action.request.topic } : {}),
        ...(action.request.sourceSession !== undefined ? { sourceSession: action.request.sourceSession } : {}),
        ...(action.request.replyTo !== undefined ? { replyTo: action.request.replyTo } : {}),
      });
      return { type: "posted", result };
    }
    const readResult = await this.#service.read(action.request);
    return { type: "read", result: readResult };
  }
}

export type DiscussionHookResultDispatch =
  | { type: "posted"; result: DiscussionPostResult }
  | { type: "read"; result: DiscussionReadResult };

function collectMentions(input: string, normalizer: AgentNameNormalizer): NormalizedAgentName[] {
  const seen = new Set<NormalizedAgentName>();
  const out: NormalizedAgentName[] = [];
  for (const match of input.matchAll(MENTION_PATTERN)) {
    const raw = match[2];
    if (raw === undefined) {
      continue;
    }
    const normalized = normalizer.normalizeOrNull(raw);
    if (normalized === null) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function hasPostVerb(input: string): boolean {
  return /(记录|写入|发到|发送到|发送|推到|记到|记一下|写一下|发一下)\s*(到|进)?\s*讨论区/u.test(input)
    || /post to (?:the )?discussion/u.test(input);
}

function hasReadVerb(input: string): boolean {
  return /(读取|读取一下|看看|查看|查看一下|读一下|拉取|拉一下|拉取一下)\s*(讨论区)?/u.test(input)
    || /read (?:the )?discussion/u.test(input);
}

// ---- structured command parsing ----

interface CommandParts {
  tokens: string[];
  flagValues: Map<string, string>;
  positional: string[];
}

function tokenize(input: string): CommandParts {
  const flagValues = new Map<string, string>();
  const positional: string[] = [];
  const parts = input.split(/\s+/u).filter((token) => token.length > 0);
  for (let index = 0; index < parts.length; index += 1) {
    const raw = parts[index];
    if (raw === undefined) {
      continue;
    }
    if (raw === "--") {
      const rest = parts.slice(index + 1).join(" ");
      if (rest.length > 0) {
        positional.push(rest);
      }
      break;
    }
    if (raw.startsWith("--")) {
      const flag = raw.slice(2);
      const next = parts[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flagValues.set(flag, next);
        index += 1;
      } else {
        flagValues.set(flag, "true");
      }
      continue;
    }
    if (raw.startsWith("@")) {
      positional.push(raw);
      continue;
    }
    positional.push(raw);
  }
  return { tokens: parts, flagValues, positional };
}

function parseCommandPost(
  rest: string,
  identity: AgentIdentity,
  normalizer: AgentNameNormalizer,
): { request: DiscussionPostRequest } {
  const parts = tokenize(rest);
  const targetTokens = parts.positional.filter((token) => token.startsWith("@"));
  const targets = normalizer.normalizeAll(targetTokens.map((token) => token.slice(1)));
  if (targets.length === 0) {
    throw new DiscussionValidationError("Discussion post requires at least one @<agent> target");
  }
  const topic = parts.flagValues.get("topic");
  const replyTo = parts.flagValues.get("reply-to") ?? parts.flagValues.get("reply_to");
  const sourceSession = parts.flagValues.get("source-session") ?? parts.flagValues.get("source_session");
  const rawContent = parts.flagValues.get("content") ?? extractTrailingContent(parts);
  if (rawContent === undefined || rawContent.trim().length === 0) {
    throw new DiscussionValidationError("Discussion post requires non-empty content");
  }
  return {
    request: {
      from: identity.agentId,
      to: targets,
      content: rawContent,
      ...(topic !== undefined ? { topic } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...(sourceSession !== undefined ? { sourceSession } : {}),
    },
  };
}

function parseCommandRead(
  rest: string,
  identity: AgentIdentity,
  _normalizer: AgentNameNormalizer,
): { request: DiscussionReadRequest } {
  const parts = tokenize(rest);
  const entryId = parts.flagValues.get("entry");
  const topic = parts.flagValues.get("topic");
  const from = parts.flagValues.get("from");
  const since = parts.flagValues.get("since");
  const limit = parts.flagValues.get("limit");
  const request: DiscussionReadRequest = {
    currentAgent: identity.agentId,
    ...(topic !== undefined ? { topic } : {}),
    ...(from !== undefined ? { from: from as KnownAgentName } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(entryId !== undefined ? { entryId } : {}),
    ...(limit !== undefined ? { limit: Number.parseInt(limit, 10) } : {}),
  };
  return { request };
}

function extractTrailingContent(parts: CommandParts): string | undefined {
  const positional = parts.positional.filter((token) => !token.startsWith("@"));
  if (positional.length === 0) {
    return undefined;
  }
  return positional.join(" ");
}

function buildPostRequest(
  input: string,
  mentions: NormalizedAgentName[],
  identity: AgentIdentity,
  normalizer: AgentNameNormalizer,
): DiscussionPostRequest | null {
  const topic = extractTopic(input);
  const replyTo = extractReplyTo(input);
  const content = stripLeadAndMentions(input);
  if (content.length === 0) {
    return null;
  }
  const targets = mentions.filter((mention) => mention !== identity.agentId);
  if (targets.length === 0) {
    return null;
  }
  return {
    from: identity.agentId,
    to: normalizer.normalizeAll(targets.map((m) => m.toString())),
    content,
    ...(topic !== undefined ? { topic } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
  };
}

function buildReadRequest(
  input: string,
  mentions: NormalizedAgentName[],
  identity: AgentIdentity,
  _normalizer: AgentNameNormalizer,
): DiscussionReadRequest | null {
  const topic = extractTopic(input);
  const limit = extractLimit(input);
  const entryId = extractEntryId(input);
  const from = extractFromAgent(input, mentions);
  const since = extractSince(input);
  const request: DiscussionReadRequest = {
    currentAgent: identity.agentId,
    ...(topic !== undefined ? { topic } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(entryId !== undefined ? { entryId } : {}),
  };
  void identity;
  return request;
}

function extractTopic(input: string): string | undefined {
  const match = /(?:关于|topic[:：])\s*([^\s;,，；]+)/u.exec(input);
  return match?.[1]?.replace(/[。.]+$/u, "");
}

function extractReplyTo(input: string): string | undefined {
  const match = /(?:回复|reply[_ ]?to)\s*([A-Z0-9-]+)/iu.exec(input);
  const value = match?.[1];
  if (value === undefined) {
    return undefined;
  }
  return /^DISC-\d{8}-\d{6}-\d{3}$/u.test(value) ? value : undefined;
}

function extractLimit(input: string): number | undefined {
  const match = /(最近|limit[:：]?)\s*(\d+)/iu.exec(input);
  const value = match?.[2];
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function extractEntryId(input: string): string | undefined {
  const match = /DISC-\d{8}-\d{6}-\d{3}/u.exec(input);
  return match?.[0];
}

function extractFromAgent(input: string, mentions: NormalizedAgentName[]): KnownAgentName | undefined {
  const match = /(?:来自|发件人|from)\s*@([A-Za-z][\w-]*)/u.exec(input);
  if (match === null) {
    return mentions.find((mention) => mention !== "all");
  }
  const value = match[1];
  if (value === undefined) {
    return undefined;
  }
  const normalizer = new AgentNameNormalizer();
  const normalized = normalizer.normalizeOrNull(value);
  if (normalized === null || normalized === "all") {
    return undefined;
  }
  return normalized;
}

function extractSince(input: string): string | undefined {
  const match = /(?:since|自)\s*(\d{4}-\d{2}-\d{2}T[\d:+\-Z]+)/iu.exec(input);
  return match?.[1];
}

function stripLeadAndMentions(input: string): string {
  return input
    .replace(MENTION_PATTERN, " ")
    .replace(/^(把|将|请|麻烦)?\s*(刚才)?(关于[^。.;,，]*)?(的)?(结论|意见|回复|结果|内容|记录|片段|片段内容)?(发到|发送到|记录到|写入|记到|记一下|写一下|推送到|推到|发一下)\s*(讨论区|discussion)?(里|中|里面)?\s*/u, " ")
    .replace(/^(读取|看看|查看|读一下|拉取|拉一下)\s*(讨论区|discussion)?(里|中|里面)?\s*(关于[^。.;,，]*的)?\s*(最近\s*\d+\s*条)?/u, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
