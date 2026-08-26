# Tool Runtime — Mechanism 3 Deep-Dive

> Dimension: tool-system (Conditional, triggered — concurrency + auth retry + abort)
> Commit: `98c3b24`
> Confirmed by: SOURCE_CONFIRMED (static analysis only)

## 1. End-to-End Tool Execution Flow (Updated)

```text
SessionActor.execute_tool_calls(tool_calls)
  → for each tool_call: SessionActor.prepare_tool_call()
      → MCP init wait (Blocking | Progressive)
      → args parsing + hooks
      → permissions.request(access_kind) → Decision
  → build approved list
  → build file_locks HashMap (write-path serialization)
  → for each approved:
      → tokio::spawn or FuturesUnordered::push of dispatch future
        (future contains: lock acquisition → call_with_auth_retry → dispatch_tool → WorkspaceOps::call_tool)
  → drainer task forwards results via mpsc to main loop
  → while let Some((idx, result)) = dispatch_rx.recv() — process in completion order
```

## 2. Concurrency Control (Mechanism 3)

### 2.1 File Path Serialization

```rust
// crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:387-404
let write_paths: std::collections::HashSet<String> = approved
    .iter()
    .filter(|prepared| !prepared.is_read_only)
    .filter_map(|prepared| lock_path_for_args(&prepared.parsed_args).map(str::to_owned))
    .collect();
let file_locks = {
    let mut map: std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>> =
        std::collections::HashMap::new();
    for prepared in &approved {
        if let Some(fp) = lock_path_for_args(&prepared.parsed_args)
            && write_paths.contains(fp)
        {
            map.entry(fp.to_owned())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())));
        }
    }
    map
};
```

**Key behaviors:**

1. **Path extraction via `lock_path_for_args()`** (tool_dispatch.rs:56): tries `file_path`, `path`, `target_file` keys — covers grok_build (`search_replace`), opencode (`EditTool`/`WriteTool`/`ReadTool`), codex (`read_file`), grok_build_hashline (`hashline_edit`).
2. **Write-path-only locking**: `is_read_only` filter excludes read tools (e.g., `read_file`, `grep`, `list_dir`) from locking.
3. **`tokio::sync::Mutex<()>`**: per-path lock, acquired inside each dispatch future.
4. **`target_directory` excluded** (tool_dispatch.rs:55): directory listings don't bucket into file lock.
5. **No lock = full concurrency**: read-only tools run with no path lock.

### 2.2 Dispatch via FuturesUnordered

```rust
// crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:477-491
let mut dispatch_stream = futures::stream::FuturesUnordered::new();
for fut in dispatch_futures {
    dispatch_stream.push(fut);
}
let mut approved_slots: Vec<Option<PreparedToolCall>> =
    approved.into_iter().map(Some).collect();
let (dispatch_tx, mut dispatch_rx) = tokio::sync::mpsc::unbounded_channel::<(usize, _)>();
let drainer = tokio::spawn(async move {
    while let Some(item) = dispatch_stream.next().await {
        if dispatch_tx.send(item).is_err() { break; }
    }
    drop(approved_slots);
});
```

**Concurrency model:**

1. **`FuturesUnordered`**: drives all dispatch futures concurrently. Each future holds its own `Arc<Mutex<()>>` lock acquisition.
2. **Completion ordering is non-deterministic**: results arrive in completion order, not spawn order.
3. **`(idx, result)` channel**: results carry their original index for slot lookup in `approved_slots`.
4. **Drainer task**: forwards each completed future's result to a mpsc channel; main loop reads them one by one.

### 2.3 Auth Retry During Tool Execution

```rust
// crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:451-458
let result = call_with_auth_retry(
    am.as_ref(),
    Some(&shared_recovery),
    &prepared.tool_name,
    run_tool,
).await;
```

`call_with_auth_retry` (defined elsewhere) handles 401 by attempting auth refresh **once** and retrying, with `shared_recovery` ensuring only one retry across all concurrent tool calls.

### 2.4 Interruptible Wait Tools

```rust
// crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:440-449
let result = if interruptible {
    let _wait_guard = BlockingWaitGuard::enter(blocking_wait_depth.clone());
    tokio::select! {
        biased; result = call_with_auth_retry(...) => result,
        _ = wait_for_pending_interjection(&pending_interjections) => {
            tracing::info!(tool = %prepared.tool_name, "abort wait tool: interjection pending");
            Ok(interrupted_wait_tool_result(&prepared.parsed_args))
        }
    }
} else { ... };
```

`is_interruptible_wait_tool()` determines if the tool is interruptible (likely sleep/wait-class). When a user message comes in, `wait_for_pending_interjection` fires, racing with the tool execution.

## 3. Auth Retry Mechanism

- [F] `call_with_auth_retry` is called per-dispatch with `Some(&shared_recovery)` (line 444, 451)
- [F] `shared_recovery: Arc<tokio::sync::OnceCell<bool>>` is constructed once per `execute_tool_calls` call (line 405)
- [F] This `OnceCell` ensures **only one auth retry** across all concurrent tool calls in the same batch — preventing retry storms

## 4. Partial Failure Handling

- [F] Each tool result is independent — one tool's failure does not abort others
- [F] `handle_bridge_tool_success()` (line 539) processes each result individually
- [F] Managed MCP tools (line 499-516): if a tool returns auth rejection, `reactive_managed_reauth()` is attempted **synchronously** before the tool result is finalized
- [F] Cancellation: `pending_interjections` and `wait_for_pending_interjection` allow user cancellation of wait-class tools

## 5. Lifecycle of a Single Tool Execution

```text
execute_tool_calls
  → for each tool_call (pre-pass):
      prepare_tool_call → permission → push to approved
  → build file_locks (only write-path tools)
  → push all dispatch futures into FuturesUnordered
  → for each completed future (as it arrives):
      lock_path acquire → call_with_auth_retry → dispatch_tool
      → WorkspaceOps.call_tool → FinalizedToolset.call → ToolRunResult
  → drainer forwards result to dispatch_rx
  → main loop processes result:
      handle_bridge_tool_success → ChatStateActor.push_tool_result
      → continue iteration of sampling loop or end_turn
```

## 6. RoboThree Mapping (Updated)

| RoboThree Module | Conclusion | Reasoning |
| --- | --- | --- |
| Tool Runtime (concurrency) | **ADAPT** | `FuturesUnordered` + per-path `tokio::Mutex` is a sound model. RoboThree should simplify by using `JoinSet` (Tokio-native, no FuturesUnordered dep) but keep the per-path locking pattern |
| Tool Registry | ADAPT | (Unchanged from Level 2) |
| Tool Permission | ADAPT | (Unchanged from Level 2) |

## 7. Risks

1. **Read-after-write race**: Read tools (no lock) and write tools (with lock) on the same file can race — the read might happen before the write acquires the lock, returning stale data. Mitigation: per-tool consistency model — only relevant for tools that read-modify-write.
2. **`OnceCell<bool>` recovery not reset across turns**: if `shared_recovery` is per-`execute_tool_calls` call, recovery is fresh each batch; but if any auth-rejected tool in batch A wasn't retried (because some other tool already triggered recovery), the failure is final.
3. **Memory cost of `FuturesUnordered`**: holding all futures simultaneously uses linear memory in batch size. For typical model responses (≤10 tool calls) this is fine.
4. **No backpressure**: dispatch channel is `unbounded`; if main loop is slow, dispatch_rx queue grows unbounded.

## 8. Recommended RoboThree Behavior

- **MVP**: Use `tokio::task::JoinSet` instead of `FuturesUnordered` (idiomatic Tokio).
- **MVP**: Per-path `tokio::sync::Mutex<()>` is the right pattern; document the lock extraction keys.
- **MVP**: `is_read_only` flag on tool definition is the right precondition for skipping locks.
- **MVP**: Use bounded mpsc for dispatch_rx or limit batch size to avoid unbounded growth.
- **Post-MVP**: Consider dependency-aware scheduling (e.g., read-after-write within batch).