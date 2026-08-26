# Hermes Agent — Source Map

## Core Agent Runtime (`agent/`)

The `agent/` directory (~100+ Python files) is the heart of the runtime. Key files by responsibility:

### Agent Loop & Initialization

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/conversation_loop.py` | **Main agent loop** — one user turn through model call, tool dispatch, retries, compression | `run_conversation()` (L565) |
| `agent/turn_context.py` | Per-turn setup — context assembly, memory prefetch, plugin hooks | `build_turn_context()` |
| `agent/agent_init.py` | Agent initialization — provider setup, toolset, config | — |
| `agent/agent_runtime_helpers.py` | Message repair, sequence validation | `repair_message_sequence_with_cursor()` |
| `agent/iteration_budget.py` | Budget-tracking for iteration limits | `IterationBudget` class |
| `agent/turn_retry_state.py` | Per-turn retry state tracking | `TurnRetryState` class |

### Context & Compression

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/context_engine.py` | Context assembly engine | — |
| `agent/context_compressor.py` | Context compression logic | `should_compress()`, `context_length` |
| `agent/conversation_compression.py` | History compression implementation | `conversation_history_after_compression()` |
| `agent/prompt_builder.py` | System prompt construction | `format_steer_marker()` |
| `agent/prompt_caching.py` | Anthropic cache control injection | `apply_anthropic_cache_control()` |
| `agent/coding_context.py` | Code-specific context assembly | — |
| `agent/context_references.py` | Context reference tracking | — |
| `agent/context_breakdown.py` | Token breakdown for context | — |

### Tool System

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/tool_executor.py` | **Tool execution** — concurrent, sequential, segmented dispatch | `execute_tool_calls_concurrent()` (L327), `execute_tool_calls_sequential()` (L1028) |
| `agent/tool_dispatch_helpers.py` | Tool dispatch helpers — safety, batching, result formatting | `_is_destructive_command()` (L81), `make_tool_result_message()` (L457), `_plan_tool_batch_segments()` (L105) |
| `agent/tool_guardrails.py` | Guardrail pre-execution checks | `ToolGuardrailDecision`, `before_call()` |
| `agent/tool_result_classification.py` | Tool result classification | — |

### Memory & Learning

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/memory_manager.py` | Persistent memory management | `build_memory_context_block()` |
| `agent/memory_provider.py` | Memory storage backends | — |
| `agent/learning_graph.py` | Learning graph (skill auto-generation) | — |
| `agent/learning_mutations.py` | Learning mutations | — |
| `agent/curator.py` | Memory/skill curation | — |
| `agent/manual_compression_feedback.py` | User feedback for compression | — |

### Skill & Plugin

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/skill_commands.py` | Skill command handling | — |
| `agent/skill_bundles.py` | Skill bundle packaging | — |
| `agent/skill_preprocessing.py` | Skill preprocessing | — |
| `agent/skill_utils.py` | Skill utilities | — |
| `agent/plugin_llm.py` | Plugin LLM hooks | — |

### Session & State

| File | Role | Key Symbol |
| --- | --- | --- |
| `agent/trajectory.py` | Trajectory/scratchpad management | `has_incomplete_scratchpad()` |
| `agent/background_review.py` | Background memory/skill review | — |
| `agent/turn_finalizer.py` | End-of-turn cleanup and persistence | — |
| `agent/oneshot.py` | One-shot task execution | — |

### Model Providers

| File | Role |
| --- | --- |
| `agent/anthropic_adapter.py` | Anthropic Claude adapter |
| `agent/bedrock_adapter.py` | AWS Bedrock adapter |
| `agent/vertex_adapter.py` | Google Vertex AI adapter |
| `agent/gemini_native_adapter.py` | Google Gemini native adapter |
| `agent/gemini_schema.py` | Gemini schema conversion |
| `agent/azure_identity_adapter.py` | Azure identity adapter |
| `agent/codex_responses_adapter.py` | OpenAI Codex Responses API |
| `agent/codex_runtime.py` | Codex runtime |
| `agent/lmstudio_reasoning.py` | LM Studio reasoning support |
| `agent/moonshot_schema.py` | Moonshot AI schema |
| `agent/moa_loop.py` | Mixture of Agents loop |
| `agent/moa_trace.py` | MoA tracing |

### Subagent

| File | Role |
| --- | --- |
| `agent/auxiliary_client.py` | Subagent client |
| `agent/aux_accounting.py` | Subagent usage accounting |
| `agent/copilot_acp_client.py` | Copilot ACP subagent client |

### Security & Safety

| File | Role |
| --- | --- |
| `agent/file_safety.py` | File operation safety |
| `agent/secret_scope.py` | Secret scope management |
| `agent/redact.py` | Data redaction |
| `agent/ssl_guard.py` | SSL/TLS verification |
| `agent/ssl_verify.py` | SSL verification helpers |
| `agent/error_classifier.py` | API error classification |
| `agent/retry_utils.py` | Retry and backoff logic |

### Gateway & Streaming

| File | Role |
| --- | --- |
| `agent/display.py` | Output display formatting |
| `agent/stream_diag.py` | Stream diagnostics |
| `agent/stream_single_writer.py` | Stream single-writer lock |
| `agent/bounded_response.py` | Response size bounding |
| `agent/think_scrubber.py` | Think block scrubbing |
| `agent/title_generator.py` | Session title generation |
| `agent/i18n.py` | Internationalization |

## Tool Implementations (`tools/`)

Estimated 50+ tool implementations. Key categories:

- **Terminal**: `tools/terminal_tool.py` — Shell command execution
- **File**: File read/write/patch operations
- **Browser**: `agent/browser_provider.py` — Web browsing
- **Search**: `agent/web_search_provider.py` — Web search
- **Image/Video/TTS**: Image generation, video generation, text-to-speech
- **Memory**: Memory read/write tools
- **Skill**: Skill management tools
- **Delegate**: Subagent delegation (`delegate_task`)
- **LSP**: Language Server Protocol integration (`agent/lsp/`)

## Gateway (`gateway/`)

Platform adapters for multi-platform deployment:

- Telegram, Discord, Slack, WhatsApp, Signal, iMessage, etc.
- Each adapter handles: message receive, session routing, response delivery, streaming, threading

## Entry Point Resolution

### CLI Path

```text
cli.py → run_agent.py (AIAgent) → agent/conversation_loop.py (run_conversation)
```

### Gateway Path

```text
gateway/<platform>/ → session routing → AIAgent → run_conversation
```

### TUI Path

```text
tui_gateway/ → TUI rendering → AIAgent → run_conversation
```

### MCP Path

```text
mcp_serve.py → MCP host → tool registry exposure
```

## Key Dependencies

From GitHub API repository structure:

- `pyproject.toml` / `uv.lock` — Python dependencies
- `package.json` / `package-lock.json` — JavaScript dependencies
- `Dockerfile` — Container build
- `flake.nix` — Nix build
- `cli-config.yaml.example` — CLI configuration template
