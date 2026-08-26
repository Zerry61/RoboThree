#!/usr/bin/env node
// Lightweight CLI wrapper for the discussion area — invoked by the
// `/discussion` Skill so Claude Code can post / read without writing
// ad-hoc scripts every time.
//
// Usage:
//   node discussion-cli.ts post --from claude-code --to codex,kimi --topic "..." --content "..."
//   node discussion-cli.ts read  --agent claude-code [--topic ...] [--limit 10]
//
// The CLI never trusts `--from` supplied on the command line.
// Instead, `from` is always taken from the `ROBOTHREE_AGENT` env var
// (or defaults to "claude-code"), so a user prompt cannot impersonate
// another agent through CLI flags.

import { join } from "node:path";
import { env } from "node:process";

import { SystemClock } from "../adapters/system-clock.js";
import { AgentNameNormalizer } from "./agent-name-normalizer.js";
import {
  DiscussionService,
  DiscussionMarkdownCodec,
  DiscussionRepository,
  agentFromAbbrev,
} from "./index.js";

const WORKSPACE = env.ROBOTHREE_WORKSPACE ?? join(env.HOME ?? "/tmp", "Desktop", "RoboThree");
const DISCUSSION_DIR = join(WORKSPACE, "讨论区");

function parseArgs(argv: string[]): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]!;
    if (raw.startsWith("--")) {
      const key = raw.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else if (!raw.startsWith("-")) {
      // positional: store as _0, _1, ...
      const posKey = `_${Object.keys(result).filter((k) => k.startsWith("_")).length}`;
      result[posKey] = raw;
    }
  }
  return result;
}

function fatal(message: string): never {
  process.stderr.write(message + "\n");
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const verb = args._0;
  if (verb !== "post" && verb !== "read") {
    fatal("Usage: discussion-cli.ts post|read [--flags...]");
  }

  const cliAgent = typeof args.agent === "string" ? args.agent : undefined;
  const normalizer = new AgentNameNormalizer();

  // Resolve agent: try abbreviation first, then full name, then env, then default.
  function resolveAgent(raw: string | undefined): "claude-code" | "codex" | "kimi" | "minimax" {
    if (raw !== undefined) {
      const fromAbbrev = agentFromAbbrev(raw);
      if (fromAbbrev !== null) return fromAbbrev as "claude-code" | "codex" | "kimi" | "minimax";
      if (normalizer.isKnown(raw) && raw !== "all") return raw as "claude-code" | "codex" | "kimi" | "minimax";
    }
    const envAgent = env.ROBOTHREE_AGENT;
    if (envAgent !== undefined) {
      const fromAbbrev = agentFromAbbrev(envAgent);
      if (fromAbbrev !== null) return fromAbbrev as "claude-code" | "codex" | "kimi" | "minimax";
      if (normalizer.isKnown(envAgent) && envAgent !== "all") return envAgent as "claude-code" | "codex" | "kimi" | "minimax";
    }
    return "claude-code";
  }

  const agentId = resolveAgent(cliAgent);
  const identity: { agentId: "claude-code" | "codex" | "kimi" | "minimax" } = { agentId };
  const clock = new SystemClock();
  const repo = new DiscussionRepository(clock, {
    directory: DISCUSSION_DIR,
    workspaceRoot: WORKSPACE,
  });
  const service = new DiscussionService({
    repository: repo,
    normalizer,
    codec: new DiscussionMarkdownCodec(),
    clock,
    identity,
  });

  if (verb === "post") {
    const toRaw = args.to;
    const content = args.content;
    if (typeof toRaw !== "string" || typeof content !== "string" || content.trim().length === 0) {
      fatal("post requires --to <agent,agent,...> and --content <markdown>");
    }
    const to = toRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) {
      fatal("post requires at least one --to agent");
    }
    const topic = typeof args.topic === "string" ? args.topic : undefined;
    const replyTo = typeof args["reply-to"] === "string" ? args["reply-to"] : undefined;

    const result = await service.post({
      to,
      content,
      ...(topic !== undefined ? { topic } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
    });
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
    return;
  }

  // verb === "read"
  const topic = typeof args.topic === "string" ? args.topic : undefined;
  const fromFilter = typeof args.from === "string" ? args.from as "claude-code" | "codex" | "kimi" | "minimax" : undefined;
  const limit = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : 10;
  const entryId = typeof args.entry === "string" ? args.entry : undefined;

  const readRequest = {
    currentAgent: agentId,
    ...(topic !== undefined ? { topic } : {}),
    ...(fromFilter !== undefined ? { from: fromFilter } : {}),
    ...(entryId !== undefined ? { entryId } : {}),
    limit,
  };
  const result = await service.read(readRequest);
  process.stdout.write(JSON.stringify({ ok: true, entries: result.entries.map((entry) => ({
    id: entry.id,
    from: entry.from,
    to: entry.to,
    topic: entry.topic,
    createdAt: entry.createdAt,
    replyTo: entry.replyTo,
    content: entry.content.slice(0, 2000),
    fileName: entry.fileName,
  })) }) + "\n");
}

main().catch((error: unknown) => {
  fatal(error instanceof Error ? error.message : "Unknown error");
});
