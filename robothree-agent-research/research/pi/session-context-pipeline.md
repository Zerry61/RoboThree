# Deep Dive 3: Session & Context Pipeline

> L3 Mechanism #3 | npm v0.80.7 / commit `c9715af`

## Executive Summary

Pi's session and context management solves three hard problems in agent engineering: (1) **crash-safe persistence** via append-only JSONL trees, (2) **conversation branching** via two fork strategies, and (3) **context window management** via a two-stage pipeline (transformContext → convertToLlm) with compaction entries embedded in the session tree. Combined, these create a session model that is simultaneously append-only (crash-safe), tree-structured (supporting exploration), and compaction-aware (context-efficient).

## 1. Session Model: Append-Only JSONL Tree

### 1.1 Data Model

```jsonl
{"id":"r1","type":"session_start","timestamp":"...","cwd":"/project","model":"claude-sonnet-5"}
{"id":"m1","type":"message","role":"user","content":[{"type":"text","text":"Read main.ts"}]}
{"id":"m2","parentId":"m1","type":"message","role":"assistant","content":[{"type":"text","text":"Let me read that file."},{"type":"toolCall","toolCallId":"tc1","name":"read","input":{"path":"main.ts"}}]}
{"id":"m3","parentId":"m2","type":"message","role":"toolResult","toolCallId":"tc1","content":[{"type":"text","text":"import { App } from './app';..."}]}
{"id":"m4","parentId":"m3","type":"message","role":"assistant","content":[{"type":"text","text":"The file imports App from './app'."}]}
{"id":"m5","type":"message","role":"user","content":[{"type":"text","text":"Now explain the architecture"}]}
{"id":"m6","parentId":"m5","type":"message","role":"assistant","content":[{"type":"text","text":"The architecture is..."}]}
{"id":"l1","type":"leaf","entryId":"m6"}
```

**Key properties**:
- **Append-only**: No update or delete operations — any crash leaves a valid file
- **parentId links**: Each entry references its logical parent, forming a tree
- **leaf pointer**: Durable marker pointing to current position; advancing creates branches
- **Entry types**: `session_start`, `message`, `compaction`, `leaf`, custom (via `appendEntry`)

### 1.2 Context Reconstruction Algorithm

```typescript
// SessionManager.buildSessionContext()
function buildSessionContext(): AgentMessage[] {
  const leaf = findLeafEntry();          // Find the "leaf" entry
  let current = getEntry(leaf.entryId);  // Start from leaf's target

  const messages: AgentMessage[] = [];

  while (current) {
    if (current.type === "compaction") {
      // Replace all messages BEFORE compaction with summary
      messages.unshift({
        role: "user",
        content: [{ type: "text", text: current.summary }]
      });

      // THEN keep messages AFTER firstKeptEntryId
      // (continue up but only add entries newer than firstKeptEntryId)
      current = getEntry(current.firstKeptEntryId);
      // Skip entries between compaction and firstKeptEntryId
      continue;
    }

    if (current.type === "message") {
      messages.unshift(current);  // Prepend — building from leaf to root
    }

    current = current.parentId ? getEntry(current.parentId) : null;
  }

  return messages;  // Linear message array for LLM context
}
```

**Properties**:
- **Walk**: Root-to-leaf (or leaf-to-root with prepending)
- **Compaction handling**: Inserts summary, skips summarized entries
- **Single linear output**: The tree collapses to a linear message array
- **Deterministic**: Same tree state → same output array

### 1.3 Two Fork Strategies

#### Fork Strategy 1: `navigateTree()` — In-File Branching

```
Original tree:
  m1 → m2 → m3 → m4 → m5 → m6
                              ↑ leaf

After navigateTree(m4):
  m1 → m2 → m3 → m4 → m5 → m6
                   ↑ leaf

After next prompt:
  m1 → m2 → m3 → m4 → m5 → m6
              └→ m7 (new branch)
                   ↑ leaf
```

- **Same file**: Branches coexist in one JSONL file
- **No duplication**: Only new entries appended
- **Use case**: "Go back to message 4 and try a different approach"
- **Leaf movement**: `leaf.entryId` updated to point to new position

#### Fork Strategy 2: `fork()` / `createBranchedSession()` — New File Branch

```
Original session (session-a.jsonl):
  {parentSession: null}
  m1 → m2 → m3 → m4

After fork(m3):
  session-b.jsonl:
    {parentSession: "session-a.jsonl"}
    m1' → m2' → m3'    ← Copy of path root→m3
    ↑ leaf

  session-a.jsonl:
    {parentSession: null}
    m1 → m2 → m3 → m4
                   ↑ leaf (unchanged)
```

- **New file**: Complete copy of the path from root to fork point
- **Independent**: The two files diverge completely after fork
- **Use case**: "Start a completely separate exploration from this checkpoint"
- **parentSession**: Header field tracks lineage

### 1.4 Session Lifecycle via AgentSessionRuntime

```typescript
class AgentSessionRuntime {
  session: AgentSession;  // Current active session (changes on switch/fork)

  newSession(): Promise<void>;                        // Fresh session, same cwd
  switchSession(path: string): Promise<void>;         // Resume existing JSONL
  fork(entryId: string, opts?: ForkOpts): Promise<void>;  // Branch to new file
  importFromJsonl(path: string): Promise<void>;       // Import external session
}

// After any replacement, runtime.session changes
// Consumer MUST re-subscribe to events and re-bind extensions
```

**Important behavior**: After `switchSession` or `fork`, the `runtime.session` reference changes. Any code holding a reference to the old session object will interact with a dead session. This is a known foot-gun.

## 2. Context Pipeline: Two-Stage Transformation

### 2.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Context Pipeline                      │
│                                                      │
│  AgentMessage[] (rich, 7+ types, app-custom)         │
│      │                                                │
│      ▼ Stage 1: transformContext()                    │
│      │  - Optional hook                               │
│      │  - Operates on AgentMessage[]                   │
│      │  - Can: prune old messages                     │
│      │  - Can: inject resources (AGENTS.md, skills)   │
│      │  - Can: apply compaction summaries             │
│      │  - Can: RAG query injection                    │
│      │  - Returns: AgentMessage[]                      │
│      │                                                │
│      ▼ Stage 2: convertToLlm()                        │
│      │  - Required function                            │
│      │  - Converts AgentMessage[] → LLM Message[]     │
│      │  - Filters out UI-only message types            │
│      │  - Maps custom roles → user/assistant/toolResult│
│      │  - Handles declaration-merged custom types     │
│      │  - Returns: Message[] (standard LLM format)    │
│      │                                                │
│      ▼                                                │
│  Message[] (user | assistant | toolResult)            │
│      │                                                │
│      ▼                                                │
│  LLM API Call                                         │
└─────────────────────────────────────────────────────┘
```

### 2.2 Stage 1: `transformContext()` — AgentMessage-Level

**Signature**:
```typescript
type TransformContextFn = (
  messages: AgentMessage[],
  signal?: AbortSignal,
) => Promise<AgentMessage[]>;
```

**What it can do**:
| Operation | Example | When |
|---|---|---|
| **Prune** | Remove messages older than N turns | Always (context limit approaching) |
| **Inject** | Add AGENTS.md content as system context | Every turn |
| **Compact** | Replace old messages with summary | Auto-triggered or manual |
| **RAG** | Inject retrieved documents | On-demand |
| **Resource injection** | Add skill descriptions (`<available_skills>`) | Every turn |
| **Truncate** | Drop oldest tool results first | Context overflow |

**Implementation pattern**:
```typescript
async function transformContext(
  messages: AgentMessage[],
  signal?: AbortSignal,
): Promise<AgentMessage[]> {
  // 1. Estimate token count
  const tokenCount = estimateTokens(messages);

  // 2. If over threshold, compact oldest messages
  if (tokenCount > CONTEXT_LIMIT * 0.8) {
    messages = await compactOldestMessages(messages);
  }

  // 3. Inject skill descriptions
  const skillBlock = buildSkillDescriptionBlock(availableSkills);
  messages = injectSystemContext(messages, skillBlock);

  // 4. Inject AGENTS.md / project context
  const projectContext = await loadProjectContext();
  messages = injectSystemContext(messages, projectContext);

  return messages;
}
```

### 2.3 Stage 2: `convertToLlm()` — Type Normalization

**Signature**:
```typescript
type ConvertToLlmFn = (
  messages: AgentMessage[],
) => Message[];  // Standard LLM format
```

**What it does**:

AgentMessage is a rich type supporting 7+ message roles via TypeScript declaration merging:

```typescript
// Built-in types:
type AgentMessage =
  | { role: "user"; content: ContentBlock[] }
  | { role: "assistant"; content: ContentBlock[]; ... }
  | { role: "toolResult"; toolCallId: string; content: ContentBlock[]; ... }

// App-specific types via declaration merging:
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: { role: "notification"; text: string; timestamp: number };
    system_event: { role: "system_event"; event: string; data: unknown };
    // ... any number of custom types
  }
}
```

`convertToLlm` must:
1. **Filter** UI-only messages (notifications, system events)
2. **Map** custom roles to standard LLM roles (or skip them)
3. **Ensure** valid interleaving: user/assistant/toolResult alternation
4. **Handle** tool calls: toolResult must follow assistant with toolCall

```typescript
function convertToLlm(messages: AgentMessage[]): Message[] {
  const llmMessages: Message[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "user":
        llmMessages.push({ role: "user", content: msg.content });
        break;
      case "assistant":
        llmMessages.push({ role: "assistant", content: msg.content });
        break;
      case "toolResult":
        llmMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
        break;
      // Custom types:
      case "notification":
      case "system_event":
        // Skip — not sent to LLM
        break;
      default:
        // Custom types with unknown roles — skip or map
        break;
    }
  }

  return llmMessages;
}
```

### 2.4 The Declaration Merging Trick

Pi uses TypeScript's **declaration merging** to let consumers define custom message types without forking the core library:

```typescript
// In pi-agent-core:
interface CustomAgentMessages {}  // Empty by default

type AgentMessage = BuiltInAgentMessage | CustomAgentMessage;

// In consuming app:
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    ui_notification: { role: "ui_notification"; text: string };
    // These messages exist in AgentMessage[] but are
    // filtered out by convertToLlm before reaching the LLM
  }
}
```

This is a **zero-cost extension mechanism** at the type level — no runtime overhead, no plugin system, just TypeScript types.

## 3. Compaction: Tree-Native Context Management

### 3.1 Compaction Entry Structure

```jsonl
{"id":"c1","parentId":"m10","type":"compaction","summary":"The user asked about the project architecture. The assistant read main.ts, app.ts, and explained the module structure. Key findings: the app uses a layered architecture with controllers, services, and repositories.","firstKeptEntryId":"m11","tokenCount":4500}
```

### 3.2 Compaction Process

```
Before compaction:
  m1 → m2 → ... → m10 → m11 → m12 → m13
                                      ↑ leaf

Compaction triggered (compact()):
  1. Identify compaction boundary (messages up to m10)
  2. Generate summary of m1..m10
  3. Insert compaction entry c1 with parentId=m10
  4. Set firstKeptEntryId=m11

After compaction:
  m1 → m2 → ... → m10
                  ↓
                 c1 (summary of m1..m10)
                  ↓
                 m11 → m12 → m13
                         ↑ leaf

buildSessionContext() reconstruction:
  Start from m13, walk back:
    m13 → m12 → m11 → c1 (compaction!)
    → Replace m1..m10 with c1.summary
  Result: [c1.summary, m11, m12, m13]
```

### 3.3 Known Issue: Auto-Compaction Race (#5512, #3660)

Pi has known bugs with auto-compaction:

- **#3660**: Auto-compaction triggers AFTER context overflow, not before — by the time it fires, the context window may already be exceeded
- **#5512**: No mid-turn context guard — long tool loops (many tool calls in one turn) can exceed `contextWindow` because compaction is checked between turns, not within a turn

### 3.4 Manual vs Auto Compaction

| Aspect | Manual (`compact()`) | Auto |
|---|---|---|
| **Trigger** | User command (`/compact`) | Token threshold |
| **When** | During "idle" phase only | Between turns |
| **Granularity** | User chooses boundary | Automatic boundary selection |
| **Summary quality** | Not specified | LLM-generated summary |
| **Known issues** | None | #3660 (post-overflow), #5512 (no mid-turn guard) |

## 4. End-to-End Session Flow

```
Session Start
  │
  ├─ SessionManager.create(cwd, dir) or .inMemory(cwd)
  ├─ New JSONL file created (or in-memory store)
  ├─ session_start entry appended
  │
User sends first prompt
  │
  ├─ AgentSession.prompt("Read main.ts")
  │     │
  │     ├─ SessionManager.appendMessage(userMsg)
  │     │    └─ Write JSONL line: {id, type:"message", role:"user", content}
  │     │
  │     ├─ SessionManager.buildSessionContext()
  │     │    └─ Walk tree leaf→root, handle compactions
  │     │    └─ Return AgentMessage[]
  │     │
  │     ├─ transformContext(messages)
  │     │    └─ Inject skill descriptions, AGENTS.md
  │     │
  │     ├─ convertToLlm(messages)
  │     │    └─ Filter custom types, convert to LLM format
  │     │
  │     ├─ LLM call + tool execution (via agentLoop)
  │     │
  │     ├─ SessionManager.appendMessage(assistantMsg)
  │     │    └─ Write JSONL: {id, parentId, type:"message", role:"assistant"}
  │     │
  │     ├─ SessionManager.appendMessage(toolResultMsg)
  │     │    └─ Write JSONL: {id, parentId, type:"message", role:"toolResult"}
  │     │
  │     └─ SessionManager.updateLeaf(newEntryId)
  │          └─ Write JSONL: {type:"leaf", entryId:"m6"}
  │
User sends second prompt
  │
  ├─ Same flow, but context rebuild starts from new leaf
  │
Context approaches limit
  │
  ├─ Compaction triggers (auto or manual)
  ├─ compaction entry inserted into tree
  ├─ Next context rebuild uses summary, not raw old messages
  │
User forks session
  │
  ├─ SessionManager.fork(entryId)
  ├─ New JSONL file created with parentSession header
  ├─ Root→entryId path copied to new file
  └─ New leaf set in forked file
```

## 5. Critical Design Decisions & Trade-offs

### 5.1 Append-Only (No Updates, No Deletes)

**Decision**: JSONL sessions never mutate existing entries.

**Why**:
- Crash safety: write failures can't corrupt existing data
- Audit trail: complete history preserved forever
- Simplicity: no locking, no write-ahead log, no MVCC
- Git-friendly: JSONL diffs are readable line-by-line

**Trade-off**:
- Storage grows unboundedly (mitigated by compaction)
- Cannot "edit" a previous message (must fork)
- Leaf pointer must be durable (separate line in append-only log)

### 5.2 Tree Model with Linear Reconstruction

**Decision**: Sessions are trees, but LLM context is always a single linear array.

**Why**:
- LLMs can only accept linear message sequences
- Tree structure enables branching without losing history
- Walk path: always current leaf to root (single unambiguous path)

**Trade-off**:
- Cannot feed LLM multiple branches simultaneously (no "parallel timelines")
- Tree complexity hidden from LLM — agent doesn't know it's in a branch

### 5.3 Compaction as Tree Entry (Not Separate File)

**Decision**: Compaction summaries are tree entries, not separate metadata.

**Why**:
- Crash consistency: compaction is just another append, same atomicity guarantees
- Branching compatibility: different branches can have different compaction points
- Replay: replaying the JSONL reproduces the exact context the LLM saw

**Trade-off**:
- Compaction entries make tree traversal more complex (special case in loop)
- Summary quality is not independently versioned

### 5.4 In-Memory vs File-Backed

**Decision**: Both modes supported via `SessionManager.create(cwd, dir)` vs `SessionManager.inMemory(cwd)`.

**Why**:
- File-backed: persistence, crash recovery, sharing
- In-memory: speed, testing, ephemeral use cases
- Same API surface — consumer doesn't care which backend

**Trade-off**:
- Two code paths to maintain
- In-memory sessions lose all history on process exit

## 6. Comparison with Other Session Models

| Aspect | Pi | Claude Code | ChatGPT | LangChain |
|---|---|---|---|---|
| **Storage format** | Append-only JSONL | Markdown files | Proprietary cloud | In-memory (default) |
| **Tree structure** | ✅ parentId links | ❌ Linear | ✅ Conversation forks | ❌ Linear |
| **Fork mechanism** | navigateTree + fork | N/A | UI-based | N/A |
| **Compaction** | Tree-embedded entries | Manual summarization | Auto-summarization | ConversationSummaryMemory |
| **Crash safety** | ✅ Append-only | ✅ File writes | ✅ Cloud storage | ❌ In-memory |
| **Branching** | ✅ Two strategies | ❌ | ✅ UI-only | ❌ |
| **Declaration merging** | ✅ CustomAgentMessages | ❌ | ❌ | ❌ |
| **Context pipeline** | 2-stage explicit | Implicit | Internal | 1-stage (prompt template) |

## 7. RoboThree Implications

### What to ADOPT

1. **Append-only JSONL sessions**: Crash-safe, auditable, git-friendly. RoboThree should use this as the default session format.

2. **Two-stage context pipeline**: Separate AgentMessage-level transforms (pruning, injection) from LLM format conversion. Clean separation of concerns.

3. **Declaration merging for custom messages**: TypeScript-native extension of message types without forking core types. Elegant and zero-runtime-cost.

4. **Tree with linear reconstruction**: Keep session data as tree for branching/forking, but always produce a linear array for the LLM.

### What to ADAPT

1. **Compaction as tree entry**: Brilliant idea, but Pi's implementation has known races (#3660, #5512). RoboThree should implement compaction with **pre-turn context budget checking** (check BEFORE assembling context, not after overflow).

2. **Session replacement foot-gun**: Pi's `runtime.session` reference change after fork/switch is a common source of bugs. RoboThree should use a **stable session handle** (e.g., RxJS Observable or event emitter that survives replacement).

3. **Fork strategies**: Two strategies (in-file vs new-file) is good. RoboThree should add a third: **shallow fork** that shares the pre-fork portion via reference, avoiding duplication.

### Risks

- Append-only means unbounded growth; compaction must be reliable for long-running agents
- Declaration merging is TypeScript-only; other language bindings need a different approach
- Tree reconstruction is O(depth) per context build; caching is essential for deep trees

## 8. Evidence Quality Assessment

| Aspect | Status |
|---|---|
| **JSONL format confirmed** | ✅ From official SDK docs + community analysis |
| **navigateTree vs fork** | ✅ Cross-referenced from 3+ sources |
| **transformContext + convertToLlm** | ✅ Confirmed from core architecture analysis |
| **Declaration merging** | ✅ Confirmed from type system analysis |
| **Compaction bugs** | ✅ Confirmed from GitHub issues #5512, #3660 |
| **Exact reconstruction algorithm** | ⚠️ Approximate — community analysis, not line-for-line source |
