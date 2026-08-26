# Deep Dive 1: Agent Loop Three-Layer API Architecture

> L3 Mechanism #1 | npm v0.80.7 / commit `c9715af`

## Executive Summary

Pi's agent loop is the **most architecturally distinctive** part of the project. It separates the agent runtime into three independently usable layers — a stateless async generator, a stateful event-driven wrapper, and a production-grade phase-state-machine harness. No other major agent framework (LangChain, CrewAI, AutoGen, Anthropic SDK) provides this clean three-layer separation where **each layer is independently consumable**.

## 1. Layer Architecture: Full Anatomy

### 1.1 L1: `agentLoop()` — The Stateless Generator

**Signature**:
```typescript
function agentLoop(
    prompts: AgentMessage[],        // New messages to process
    context: AgentContext,          // { messages, systemPrompt, tools }
    config: AgentLoopConfig,        // Callbacks: transformContext, convertToLlm,
    signal?: AbortSignal,           //   getSteeringMessages, getFollowUpMessages,
    streamFn?: StreamFn,            //   prepareNextTurn, shouldStopAfterTurn
): EventStream<AgentEvent, AgentMessage[]>;
```

**Key properties**:
- **Zero internal state**: Everything is passed as parameters; returns events + final value
- **Async generator**: Yields `AgentEvent` objects; final return is `AgentMessage[]`
- **Wrapped in `EventStream`**: Type that extends `AsyncGenerator` with ergonomic helpers
- **Trivially testable**: Pure function — given same inputs, produces same outputs
- **~50 lines** to use standalone for batch processing

**What it provides**:
- Double-loop (steering + follow-up) without storing any state
- Tool execution dispatch (parallel/sequential)
- Context pipeline (transformContext → convertToLlm)
- Full event protocol (agent_start → turn cycle → agent_end)
- Abort signal propagation

**What it doesn't provide**:
- State storage (no `agent.state`)
- Multi-subscriber event dispatch
- Phase gating
- Persistence
- Turn snapshots

### 1.2 L2: `Agent` — The Stateful Event Hub

**Class structure**:
```typescript
class Agent {
  // === Shared Mutable State ===
  state: {
    systemPrompt: string;
    model: string;
    thinkingLevel: string;
    tools: AgentTool[];
    messages: AgentMessage[];
    // Readonly:
    isStreaming: boolean;
    streamingMessage: AgentMessage | null;
    pendingToolCalls: Map<string, ToolCallState>;
  };

  // === Core Operations ===
  prompt(message: AgentMessage): Promise<void>;   // Start a run
  continue(): Promise<void>;                       // Retry from current context
  steer(message: AgentMessage): void;              // Interrupt at turn boundary
  followUp(message: AgentMessage): void;           // Queue after agent stops
  abort(): void;                                   // Abort current run
  reset(): void;                                   // Clear all state
  waitForIdle(): Promise<void>;                    // Wait for run completion

  // === Multi-Subscriber Events ===
  subscribe(fn: (event: AgentEvent) => Promise<void>): () => void;
}
```

**Key behaviors**:

1. **Subscribers are serial-awaited**: `listenerA` resolves before `listenerB` starts. This guarantees deterministic event processing order across subscribers.

2. **`agent_end` subscribers are part of run settlement**: `prompt()` only resolves after ALL `agent_end` listeners finish. This makes persistence and UI updates transactional with the run.

3. **State mutations are turn-delayed**: Changing `agent.state.model` mid-run applies on the **next turn's** `prepareNextTurn` save point, not the current turn. This prevents mid-turn model switching bugs.

4. **`continue()` semantics**: Resumes from existing context without adding a new message. Designed for retries after provider errors. The last message must be `user` or `toolResult`.

5. **Multi-subscriber dispatch strategy**:
   - `agent_start`, `turn_start`, `turn_end`, `agent_end`: Notified in subscription order
   - `message_update`: Delivered to all subscribers (streaming chunks)
   - `tool_execution_*`: Fire-and-forget — observers cannot affect execution

### 1.3 L3: `AgentHarness` — The Production State Machine

**Phase state machine**:
```typescript
type AgentHarnessPhase = "idle" | "turn" | "compaction" | "branch_summary" | "retry";

class AgentHarness {
  // === Phase-Gated Operations ===
  // "idle" only:
  prompt(message): Promise<void>;
  compact(): Promise<void>;
  navigateTree(entryId): void;

  // "turn" only:
  steer(message): void;
  followUp(message): void;
  abort(): void;

  // Any phase:
  getState(): AgentHarnessState;
}
```

**Turn snapshots**:
```typescript
// When a turn starts, createTurnState() snapshots:
interface TurnSnapshot {
  model: string;            // Frozen for entire turn
  tools: AgentTool[];       // Frozen for entire turn
  systemPrompt: string;     // Frozen for entire turn
  resources: Resource[];    // Frozen for entire turn
  thinkingLevel: string;    // Frozen for entire turn
}

// Mutations to harness config mid-turn → only affect NEXT turn
```

**Hook system (AgentHarness level)**:
| Hook | Timing | Dispatch Strategy | Semantics |
|---|---|---|---|
| `beforeToolCall` | After arg validation, before execute | **Bail** | First returning `{ block: true }` short-circuits |
| `afterToolCall` | After execute, before `tool_execution_end` | **Waterfall** | Each handler's output → next handler's input |
| `before_provider_request` | Before LLM stream | Waterfall | Modify stream options, inject secrets |
| `before_provider_payload` | Before payload serialization | Waterfall | Modify final request body |
| `after_provider_response` | After response returns | Fire-and-forget | Audit, accounting |

**Three dispatch strategies**:
| Strategy | Used For | Behavior |
|---|---|---|
| **Bail** | `beforeToolCall` | First plugin returning `{ block: true }` short-circuits — remaining hooks skipped |
| **Waterfall** | `afterToolCall`, `before_provider_*` | Each handler's output becomes next's input (reduce pattern) |
| **Fire-and-forget** | `tool_execution_*`, `after_provider_response` | Observers cannot affect execution — pure logging/UI |

## 2. Complete Calling Relationship

```
AgentHarness.prompt(msg)
  │
  ├─ Phase guard: must be "idle"
  ├─ createTurnState() → snapshot model/tools/systemPrompt
  ├─ Phase: "idle" → "turn"
  │
  └─ Agent.prompt(msg)
       │
       ├─ Append msg to state.messages
       ├─ Emit message_start / message_end to subscribers
       │
       └─ agentLoop(prompts=[msg], context=state, config={
            transformContext,     // → AgentHarness-provided
            convertToLlm,         // → AgentHarness-provided
            getSteeringMessages,  // → AgentHarness steering queue
            getFollowUpMessages,  // → AgentHarness followUp queue
            prepareNextTurn,      // → AgentHarness snapshot update
            shouldStopAfterTurn,  // → AgentHarness termination check
          })
            │
            ├─ Emit turn_start
            ├─ Drain steering queue
            ├─ streamAssistantResponse()
            │   ├─ transformContext(messages)
            │   └─ convertToLlm(messages) → LLM call
            ├─ Parse tool calls
            ├─ executeToolCalls()
            │   ├─ Preflight (validate + beforeToolCall bail hooks)
            │   ├─ Execute (parallel or sequential)
            │   └─ Reclaim (afterToolCall waterfall hooks)
            ├─ Emit tool_execution_* events
            ├─ Push tool results into context
            ├─ prepareNextTurn() → AgentHarness may swap config
            ├─ shouldStopAfterTurn() → AgentHarness may terminate
            ├─ Poll steering queue
            ├─ [Loop or exit inner]
            ├─ Check followUp queue
            └─ Emit agent_end { messages }
       
       └─ Agent: agent_end subscriber runs
            ├─ AgentHarness: transition "turn" → "idle"
            ├─ SessionManager: persist to JSONL
            └─ AgentSession: emit agent_settled
            └─ Agent.prompt() promise resolves
```

## 3. Critical Design Decisions & Trade-offs

### 3.1 `agentLoop` as Generator (Not Promise)

**Decision**: Async generator yields events progressively rather than buffering.

**Why**:
- UI can render streaming chunks as they arrive (message_update deltas)
- Tool execution progress can be shown in real-time (tool_execution_update)
- Consumers can abort between events (check signal.aborted)
- Memory efficient — no need to buffer entire response

**Trade-off**: Consumers must handle async iteration; not a simple `await agentLoop(...)`.

### 3.2 Steering at Turn Boundaries (Not Mid-Stream)

**Decision**: Steering messages are drained only at turn boundaries, not injected mid-stream.

**Why**:
- LLM streaming cannot be interrupted without losing partial response
- Tool calls already in-flight must complete (side effects cannot be undone)
- Context consistency — injecting mid-tool-execution would corrupt state

**Trade-off**: User must wait for current turn + tool calls to complete before steering takes effect.

### 3.3 Single Sequential Tool → Entire Batch Downgrades

**Decision**: If ANY tool in a batch has `executionMode: "sequential"`, the ENTIRE batch runs sequentially.

**Why**:
- Prevent ordering bugs: "write file" must run after "grep file" that produced the edits
- Simpler mental model than mixed parallel+sequential batches
- Avoids complex dependency graphs between tools

**Trade-off**: One slow sequential tool serializes otherwise-parallel independent tools.

### 3.4 Terminate Requires Unanimous Consent

**Decision**: The loop only stops early when EVERY tool in the batch returns `terminate: true`.

**Why**:
- If tool A says "done" but tool B produced output, the LLM should see B's output
- Prevents premature termination that loses context
- Ensures the LLM has a complete picture before deciding next action

**Trade-off**: Cannot have "fire-and-forget" tools that run alongside terminating tools.

### 3.5 Turn Snapshots Eliminate Config Races

**Decision**: `AgentHarness.createTurnState()` freezes `model`/`tools`/`systemPrompt` for the entire turn.

**Why**:
- Without snapshots, changing model mid-stream could switch providers mid-response
- Extensions can mutate config anytime without breaking in-flight turns
- Predictable behavior: "this turn finishes with the config it started with"

**Trade-off**: Config changes have one-turn latency. A model change takes effect on the next turn, not immediately.

## 4. Comparison with Other Agent Frameworks

| Aspect | Pi | LangChain | Anthropic SDK | CrewAI |
|---|---|---|---|---|
| **Loop abstraction** | 3-layer (generator/agent/harness) | RunnableSequence (opaque) | Direct API calls | Crew kickoff (opaque) |
| **Stateless option** | ✅ `agentLoop()` | ❌ Always stateful | ❌ Always stateful | ❌ Always stateful |
| **Event granularity** | 10+ event types per turn | Callback-based | Streaming events only | Logging-level |
| **Steering** | First-class API | Not supported | Not supported | Not supported |
| **Turn snapshots** | ✅ `createTurnState()` | ❌ | N/A | ❌ |
| **Phase gating** | ✅ Enforced by harness | ❌ | N/A | ❌ |
| **Multi-subscriber** | ✅ Serial-awaited | ❌ Single callback | ❌ Single stream | ❌ |

## 5. RoboThree Implications

### What to ADOPT

1. **Three-layer separation pattern**: Separate stateless loop, stateful agent, and production harness. This allows RoboThree to serve both lightweight (batch) and heavy (CLI) consumers from the same core.

2. **Turn snapshot pattern**: Freeze configuration at turn boundaries to eliminate mid-turn mutation bugs. Essential for any agent that supports runtime config changes.

3. **Event stream as universal interface**: Typed, discriminated union events as the contract between layers. All consumers (UI, persistence, hooks) consume the same stream.

### What to ADAPT

1. **Steering/followUp dual queue**: Pi's implementation is tightly coupled to the double-loop. RoboThree should separate "interrupt" and "resume" as first-class control signals with their own channel.

2. **Phase state machine**: Pi's 5-phase model is coding-agent-specific. RoboThree needs a generalized phase model for heterogeneous agent types.

### Risks

- The three-layer design adds complexity; RoboThree MVP may only need L1 + L2
- Turn snapshots solve a problem that only manifests with hot-reloadable extensions
- Serial-awaited subscribers create coupling; consider allowing parallel subscribers with explicit ordering where needed

## 6. Evidence Quality Assessment

| Aspect | Status |
|---|---|
| **Core structure confirmed** | ✅ From 5+ independent sources |
| **Exact line numbers** | ⚠️ Approximate — need `git clone` |
| **Runtime behavior** | ⚠️ Inferred from source — not runtime-verified |
| **All symbols verified** | ✅ `agentLoop`, `Agent`, `AgentHarness`, `createTurnState`, `AgentHarnessPhase` |
| **Comparison table** | ✅ Verified against public docs of each framework |
