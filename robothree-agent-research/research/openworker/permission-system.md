# Permission System — OpenWorker (L3 Deep Dive)

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`
> Focus Mechanism #2: **Inbox-based Human-in-the-Loop + Multi-Mode Permission Gating**

## 1. Permission Engine — Decision Logic

### 1.1 Evaluation Order

`PermissionEngine.evaluate()` applies rules in a precise priority order:

```text
1. READ_ONLY mode check       → if DISCUSS/PLAN + consequential → DENY
2. Path scoping (writes)       → if path not under writable root → DENY
3. Non-consequential check     → if risk level ≤ READ → ALLOW
4. AUTO mode check             → if AUTO → ALLOW
5. Command allowlist (shell)   → if EXEC + command matches → ALLOW
6. Session command grant       → if command in session_allow_commands → ALLOW
7. Session tool grant          → if tool in session_allow_tools + not connector → ALLOW
8. Task standing rules         → if tool→target in task_rules → ALLOW
9. CUSTOM mode auto-allow      → if CUSTOM + tool in auto_allow_tools → ALLOW
10. Fallback                    → NEEDS_USER
```

[F: `permissions.py:120-178`]

### 1.2 Risk Classification

```python
# From risk.py — classification is metadata-driven:
class RiskClass(Enum):
    READ = "read"            # searches, reads, git status
    WRITE_LOCAL = "write"    # file writes
    EXEC = "exec"            # shell commands
    EXTERNAL = "external"    # network/API calls (send_message, etc.)
```

`classify()` uses tool metadata (`category`, `capabilities`) plus user overrides to determine the risk class. `is_consequential()` returns True for anything above READ. [F: `risk.py`]

### 1.3 Command Allowlisting

Shell commands are the most sensitive tool. The allowlist uses `shlex` token prefix matching:

```python
def _command_allowed(self, command: str) -> bool:
    if _has_shell_operators(command):     # ; & | > < ` $( ( \n \r
        return False                       # REJECT outright
    argv = shlex.split(command)           # safe tokenization
    for allowed in self.allowed_commands:
        prefix = shlex.split(allowed)
        if prefix and argv[:len(prefix)] == prefix:
            return True                    # e.g. "git status" matches "git status -s"
    return False
```

This means `"git status"` in the allowlist matches `"git status -s"` but never `"git statusfoo"`, a bare `"git"`, or `"git status && rm -rf ~"`. [F: `permissions.py:216-238`]

### 1.4 Five Permission Modes

| Mode | Write/Exec | Planning | Use Case |
|------|-----------|----------|----------|
| `DISCUSS` | ❌ Blocked | No planning workflow | Casual Q&A |
| `PLAN` | ❌ Blocked | Must propose_plan → approve → execute | Code review |
| `INTERACTIVE` (default) | Ask per action | Not required | Normal work |
| `CUSTOM` | Auto-allow configured | Not required | Trusted workflows |
| `AUTO` | 🟢 Allowed (path-scoped) | Not required | Full automation |

Modes can flip mid-session (e.g., plan approval flips PLAN → INTERACTIVE). [F: `permissions.py:37-48; engine.py:742-748`]

## 2. Inbox System — Human Attention as Durable Queue

### 2.1 Architecture

The Inbox is a **JSON-persisted cross-session queue** of items requiring human attention:

```text
InboxStore (inbox.json)
├── InboxItem
│   ├── id: str (uuid)
│   ├── session_id: str
│   ├── type: "approval" | "question" | "directory" | "plan"
│   ├── state: "pending" | "resolved"
│   ├── visibility: "inline" | "inbox"
│   ├── inbox: str (named routing target)
│   ├── resolution: str (the answer)
│   └── tool_call_id: str (for durable resume)
├── add_approval() → InboxItem
├── add_question() → InboxItem
├── add_directory() → InboxItem
├── add_plan() → InboxItem
├── resolve(item_id, resolution) → bool
├── wait(item_id) → Awaitable[str]     # asyncio.Event-based
└── pending(session_id) → list[InboxItem]
```

### 2.2 Visibility Model

`visibility` determines where the item SHOWS:

- `VIS_INLINE` (attended): Shown inline in the session only — not in the cross-session Inbox
- `VIS_INBOX` (unattended): Shown in the cross-session Inbox — resolvable from any surface

The `UnattendedRegistry` toggles per-session visibility. When a session is marked unattended, its prompts appear in the global Inbox instead of inline. [F: `server/app.py:1478-1483`]

### 2.3 Resolution Surfaces

An Inbox item can be resolved from:

| Surface | Mechanism | Evidence |
|---------|-----------|----------|
| **Live WebSocket** | `_resolve_pending()` → `inbox.resolve(pend[0].id, resolution)` | `app.py:1648-1653, 1778-1779` |
| **REST API** | `POST /v1/inbox/{item_id}/resolve` → `manager.resolve_inbox()` | `app.py:289-294` |
| **Slack channel** | Button interaction → relay → REST resolve | `manager.py:833-844` |
| **After restart** | `resolve_inbox()` triggers `_durable_resume()` | `manager.py:833-858` |

### 2.4 Durable Resume — Restart Survival

When an inbox item is resolved but the session's engine isn't in memory (server restart):

```python
async def _durable_resume(self, item):
    engine = self.get_engine(item.session_id)     # rebuild from saved thread
    engine.resume()                                # re-process unanswered tool_calls
    # The inbox approver in get_engine re-uses the already-resolved item,
    # so inbox.wait() returns immediately instead of re-prompting.
```

`TurnEngine.resume()`:
1. Finds unanswered tool_calls in the persisted thread (_unanswered_trailing_tool_calls)
2. Re-processes them through `_handle_tool_calls()` — already-answered calls are skipped
3. Continues the normal loop to finish the turn

[F: `manager.py:846-858; engine.py:250-292`]

### 2.5 Channel Mirroring

Unattended items can mirror to a bound Slack channel:

```python
async def _mirror(item):
    await manager.mirror_inbox_item(item)
    # Sends interactive buttons to the bound channel
```

This enables "approval from Slack" — a user can approve a tool call without opening the desktop app. [F: `app.py:1485-1487`]

### 2.6 Inbox Routing

`InboxRouting` supports named inboxes with channel bindings:

```text
Named Inbox "default"  → bound to Slack #approvals → target U123ABC
Named Inbox "ops"      → bound to Slack #ops-alerts → target C456DEF
```

Items are routed to their named inbox; the binding's channel receives a mirror. [F: `inbox_routing.py`]

## 3. Approval Outcome Vocabulary

The approval system accepts a flexible vocabulary:

| Surface | Accepted Values |
|---------|----------------|
| Live Card | `once`, `always_tool`, `always_command`, `always_task`, `deny` |
| Inbox / Channel | `allow`, `always`, `deny` |
| Internal | `ApprovalOutcome.ONCE`, `.ALWAYS_TOOL`, `.ALWAYS_COMMAND`, `.DENY` |

The manager normalizes: `allow`/`always` → `ONCE` if tool isn't standing-rule-eligible, `ALWAYS_TASK` otherwise. [F: `server/app.py:1522-1524`]

### 3.1 Standing Rules (Task-Scoped)

"Always allow" on an automation run creates a **task-scoped standing rule**:

```python
# In PermissionEngine.evaluate:
if tool_name in self.task_rules:
    target = standing_rule_candidate(tool_name, arguments, metadata)
    if target and target in self.task_rules[tool_name]:
        return Decision(True, f"allowed by standing rule: {tool_name} → {target}", rule=rule)
```

Standing rules persist on the `ScheduledTask` record and are re-seeded onto the engine on every rebuild. [F: `permissions.py:165-171; manager.py:452-455`]

## 4. Path Scoping

Multi-root workspace path scoping:

```python
def _under_writable_root(self, path: str) -> bool:
    candidate = self._candidate(path)
    for rp, writable in self._resolved_roots():
        if not writable:
            continue
        try:
            candidate.relative_to(rp)
            return True
        except ValueError:
            continue
    return False
```

Roots are a shared mutable list — adding a folder mid-session takes immediate effect without engine rebuild. [F: `permissions.py:204-214; agent.py:144-149`]

## 5. Key Architectural Insights

| Insight | Type | Evidence |
|---------|------|----------|
| Permission evaluation is stateless per-call; all state is in the engine's PermissionEngine instance | FACT | `permissions.py:84-101` (dataclass fields) |
| Inbox items are JSON-persisted and survive server restarts | FACT | `inbox.py` (JSON file backing) |
| `durable_resume` can reconstruct a suspended turn across restarts | FACT | `manager.py:846-858; engine.py:250-292` |
| The approval system is surface-agnostic: WS, REST, and Slack all use the same InboxStore | FACT | `app.py:1778-1801` (all resolve through inbox) |
| Shell operator detection prevents allowlist bypass | FACT | `permissions.py:21, 223-224` |
| Task-scoped standing rules are the only way to auto-allow external-risk tools | FACT | `permissions.py:165-171`, `risk.py` (standing_rule_candidate only returns for EXTERNAL) |
| Unattended mode flips visibility but NOT the approval requirement | FACT | `app.py:1478-1483` |
