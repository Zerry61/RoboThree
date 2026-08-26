# Subagent Runtime — Mechanism 1 Deep-Dive

> Dimension: subagent-system (Conditional, triggered)
> Commit: `98c3b24`
> Confirmed by: SOURCE_CONFIRMED (static analysis only)
> Question: How does subagent permission handle propagate from parent session? What is shared vs isolated?

## 1. Entry & Spawn Path

```text
Parent session executes `task` tool call
→ task tool → handle_subagent_request()
  → crate::session::spawn_session_on_thread(
       ...,
       ctx.permission_handle.clone(),  // ← line 1172
       ctx.workspace_ops.clone(),
       ctx.parent_terminal_backend.clone(),
       ctx.parent_scheduler_handle.clone(),
       ...
     )
  → spawn_session_on_thread (spawn.rs:1661) → spawn_session_actor (spawn.rs:91)
  → spawn_session_actor at spawn.rs:180 receives inherited_permission_handle
  → spawn.rs:218: let owns_permission_manager = inherited_permission_handle.is_none()
```

**Source evidence:**

- `crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs:1172` — `ctx.permission_handle.clone()` passed as inherited
- `crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs:180` — `inherited_permission_handle: Option<PermissionHandle>` parameter
- `crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs:218` — `owns_permission_manager` flag based on inheritance

## 2. Permission Inheritance Model

### 2.1 PermissionHandle Type

```rust
// crates/codegen/xai-grok-workspace/src/permission/manager.rs:79-98
#[derive(Clone)]
pub enum PermissionHandle {
    Actor {
        cmd_tx: mpsc::UnboundedSender<PermissionCommand>,
        yolo_state: Arc<AtomicBool>,
        auto_state: Arc<AtomicBool>,
        side_query_wired: Arc<AtomicBool>,
        yolo_pin: Option<&'static str>,
        deny_read_globs: Arc<Vec<String>>,
        in_flight: Arc<AtomicUsize>,
    },
    AllowAll,
}
```

Two variants: **`Actor`** (shared with parent via `Arc<AtomicBool>` for yolo/auto states and `Arc<UnboundedSender>` for cmd channel) and **`AllowAll`** (no real manager).

### 2.2 Inheritance Decision Logic

```rust
// crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs:218-324
let owns_permission_manager = inherited_permission_handle.is_none();
let (permissions, permission_events_rx, deny_read_globs) = if let Some(handle) =
    inherited_permission_handle
{
    let (_dummy_tx, dummy_rx) = mpsc::unbounded_channel::<PermissionEvent>();
    let deny_read_globs = handle.deny_read_globs();
    (handle, dummy_rx, deny_read_globs)
} else {
    // ... create new manager via spawn_permission_manager_with_hub()
};
```

**Key facts:**

1. **Shared mode**: When `Some(handle)` is provided, the subagent uses the parent's `PermissionHandle` directly (no new actor spawn). The `permission_events_rx` from the subagent is discarded (`dummy_rx`).
2. **Owner mode**: When `None`, the subagent creates its own `spawn_permission_manager_with_hub()` instance with its own `permission_config`, `yolo_mode`, `auto_mode` settings.
3. **`deny_read_globs`** are propagated from parent regardless of ownership mode (line 223 — `handle.deny_read_globs()`).
4. **`Arc<AtomicBool>` shared state** for `yolo_state`/`auto_state` ensures that flipping yolo in the parent immediately reflects in subagents and vice versa.
5. **`Arc<UnboundedSender>`** for `cmd_tx` means parent and subagent submit permission requests to the **same actor task**. The actor (running in the parent's session) decides.
6. **`Arc<AtomicUsize>` `in_flight`** counter is shared for telemetry across subagents.

### 2.3 Isolated vs Shared

| Resource | Shared with Parent | Isolated |
| --- | --- | --- |
| Permission decision actor | ✅ (when inherited) | ✅ (when not inherited) |
| yolo/auto state (AtomicBool) | ✅ (Arc-shared) | ❌ (each session has its own AtomicBool when not inherited) |
| in-flight request counter | ✅ (Arc-shared) | ❌ |
| deny_read_globs | ✅ (copied from handle) | — |
| web_fetch_allowed_domains | ❌ (per-session) | ✅ |
| permission_events_rx | ❌ (discarded) | ✅ |
| Permission config (rules, hooks, hub transport) | ❌ | ✅ (when owned) |
| yolo_pin (managed policy pin) | ❌ (per-handle) | — |

## 3. Subagent Type Gating

Before permission handling, subagent type must be validated:

```rust
// crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs:76-94
match gate_subagent_type(&request.subagent_type, &ctx) {
    SubagentValidateTypeOutcome::Disabled => { ... pre-spawn failure ... }
    SubagentValidateTypeOutcome::NotAllowed { allowed } => { ... pre-spawn failure ... }
    _ => {}
}
```

This is **independent** of permission inheritance — even an allowed subagent type may have permissions constrained.

## 4. Context Sharing Beyond Permission

When subagent spawns, the following parent resources are cloned (`handle_request.rs:1165-1183`):

- `parent_traceparent` (OpenTelemetry trace context)
- `ctx.api_key_provider.clone()` (auth)
- `ctx.image_description_model.clone()`
- `ctx.hook_registry.clone()`
- `ctx.workspace_ops.clone()` — **filesystem handle** (shared)
- `ctx.parent_terminal_backend.clone()` — **terminal backend** (shared, blocking risk)
- `ctx.parent_scheduler_handle.clone()` — **scheduler** (shared)
- `ctx.permission_handle.clone()` — **permission** (shared)
- `ctx.managed_mcp_state.clone()` — **managed MCP state** (shared)

**Shared backend resources create a risk**: a long-running bash in subagent holds the same terminal backend as parent, potentially serializing parent's terminal commands.

## 5. Cleanup Path

When a subagent is destroyed (parent dies, or subagent completes):

- `MvpAgent::remove_session()` clears per-session state including `permission_event_receivers`, `model_unavailable_sessions`, etc. (architecture confirmed in Level 2 `architecture.md`)
- `SubagentCoordinator::handle_done/fail` removes the tracker entry
- The shared `PermissionHandle::Actor` actor lives in the parent — subagent clone of the handle keeps working until the parent's manager is dropped

## 6. Failure Paths

- **Pre-spawn failure (unknown type / disabled / not allowed)**: no session spawned; `send_pre_spawn_failure()` synthesizes a tool result with the rejection reason.
- **Spawn failure (`AgentBuildError`)**: `fail_subagent()` returns error to caller as tool result.
- **Mid-flight cancel**: `cancel_token` triggers; downstream tool executions check the token.
- **Parent session die**: `PermissionHandle::Actor` actor dies → subagent `cmd_tx.send()` returns Err → `request()` returns `Decision::Reject("permission manager unavailable")` (manager.rs:692).

## 7. RoboThree Mapping (Updated)

| RoboThree Module | Conclusion | Reasoning |
| --- | --- | --- |
| Subagent Runtime | **ADAPT** | Inheritance model is sound — share `Arc<PermissionHandle>` for stateful authorization, but RoboThree MVP should default to `None` (each agent owns its manager) for explicit security boundaries |
| Tool Permission | **ADAPT** | `Arc<AtomicBool>` for yolo/auto is a clean pattern for cross-session state; `Decision` enum taxonomy is clear |
| Worker Runtime | **ADAPT** | Subagent sharing terminal backend + workspace ops with parent is the right default; RoboThree should add explicit isolation mode for untrusted subagents |

## 8. Risks

1. **Inherited yolo bleeds across**: A `yolo_state: Arc<AtomicBool>` means parent enabling yolo instantly enables it for all live subagents. Acceptable for cooperative trust but dangerous if subagent is from a different trust level.
2. **Single permission actor = SPOF**: If the parent permission actor dies (e.g., parent session panics), all live subagents silently receive `Decision::Reject` until they're reaped.
3. **Shared terminal backend = blocking**: Subagent's blocking bash holds parent's terminal backend; concurrent commands in parent wait.
4. **No per-subagent audit trail**: `in_flight: Arc<AtomicUsize>` is the only shared telemetry counter; no per-subagent decision log is enforced.

## 9. Recommended RoboThree Behavior

- **MVP**: Default to `None` (each subagent owns its permission manager), enforce explicit `inherit_from_parent: bool` config
- **Post-MVP**: Allow inheritance but tag inherited sessions with `parent_session_id` in audit logs
- **Security hardening**: Subagents with different trust levels MUST NOT inherit; require explicit non-inherited mode