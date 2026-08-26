# security-review.md — 安全深度审查

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. 安全态势概览

### 1.1 核心安全机制

| 机制 | 实现方式 | 保护层级 |
| --- | --- | --- |
| 安全风险分析 | LLM 初步标记 + SecurityAnalyzer 验证 | Action 级别 |
| 确认策略 | ConfirmationPolicy 根据风险决定是否需要确认 | Action 级别 |
| Hook 拦截 | Pre-action hook 可在执行前阻止 | Action 级别 |
| Workspace 隔离 | Docker/Apptainer/Cloud 容器 | 进程级别 |
| 密钥管理 | SecretRegistry + Cipher 加密持久化 | 配置级别 |
| API 认证 | X-Session-API-Key header + Workspace Cookie | 网络级别 |

### 1.2 安全边界分析

```
┌──────────────────────────────────────────────────┐
│                 API 边界                          │
│  X-Session-API-Key → check_session_api_key()     │
├──────────────────────────────────────────────────┤
│              Hook 边界                            │
│  pre_action → blocked_reason → UserRejectObs     │
│  pre_user_message → blocked_messages → FINISHED  │
├──────────────────────────────────────────────────┤
│            Confirmation 边界                      │
│  SecurityAnalyzer → SecurityRisk → Policy.should_confirm() │
├──────────────────────────────────────────────────┤
│             Workspace 边界                        │
│  BaseWorkspace.exec_command() / file_ops         │
│  Local: 无隔离 | Docker: 容器 | Remote: API       │
└──────────────────────────────────────────────────┘
```

## 2. 已知风险与弱点

### 2.1 LocalWorkspace 零隔离

**风险**：`LocalWorkspace` 直接执行用户机器上的命令。
- Agent 可以 `rm -rf /`、修改 `~/.ssh/`、读取环境变量
- 无 seccomp、无 chroot、无 capability 限制

**缓解**：通过 `ConfirmationPolicy` 和 Hook 拦截，但这些是**用户级控制**而非系统级防护。

### 2.2 LLM 自评风险

**风险**：LLM 填写自己的 `security_risk` 字段。
- 恶意 prompt 注入可能使有害操作被标记为 LOW
- 安全分析器的验证是可选组件（`SecurityAnalyzerBase` 需要用户实现）

证据 — [agent.py:1050-1051](openhands-sdk/openhands/sdk/agent/agent.py#L1050-L1051)：无安全分析器时所有风险默认为 UNKNOWN，但仍通过确认策略。

### 2.3 工具参数注入

LLM 输出直接构造 Action 对象：
- Pydantic 验证提供类型安全，但不提供语义安全
- 路径遍历（`../../etc/passwd`）由工具本身处理
- 命令注入（`ls; rm -rf /`）由 TerminalTool 的 shell 解析

### 2.4 密钥在 MCP 配置中的暴露

- MCP 配置通过 `${VAR}` 语法引用密钥
- 虽然 SecretRegistry 加密存储，但 MCP 服务器启动时的环境变量展开可能泄露密钥到子进程

### 2.5 Fork 安全性

- `fork()` 使用 JSON 往返复制 Agent 配置，包括密钥（`context={"expose_secrets": True}`）
- 子 Conversation 可能继承父 Conversation 的敏感配置

证据 — [local_conversation.py:705-706](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L705-L706)

## 3. 安全最佳实践（已实现）

### 3.1 请求验证中的密钥脱敏

FastAPI 422 响应中的 `RequestValidationError` 在返回前对密钥字段脱敏：

```python
def _sanitize_validation_errors(errors):
    for error in errors:
        if "input" in error:
            error["input"] = sanitize_dict(error["input"])
```

证据 — [api.py:421-445](openhands-agent-server/openhands/agent_server/api.py#L421-L445)

### 3.2 依赖安全约束

`pyproject.toml` 中配置了 CVE 约束的最小版本：

- `starlette>=0.49.1` (CVE-2025-62727)
- `aiohttp>=3.13.3` (CVE-2025-69223)
- `urllib3>=2.6.3` (CVE-2026-21441, CVE-2025-66471)
- `protobuf>=6.33.5` (CVE-2026-0994)
- `pillow>=12.1.1` (CVE-2026-25990)
- `lupa>=2.8` (CVE-2026-34444)

证据 — [pyproject.toml:9-18](pyproject.toml#L9-L18)

### 3.3 新包窗口排除

`exclude-newer = "7 days"` 禁止使用 7 天内发布的新包，防止供应链攻击。[F]

### 3.4 验证错误处理的 ExceptionGroup 安全检查

`_find_http_exception()` 递归搜索 `BaseExceptionGroup` 中的 `HTTPException`，防止异常组绕过错误处理。[F]

## 4. RoboThree 安全建议

| 建议 | 优先级 |
| --- | --- |
| 不采用 LLM 自评风险的模型，改为服务端确定性安全分析 | 最高 |
| Local Worker 默认启用至少 `chroot` 或 `seccomp` 级别隔离 | 高 |
| Fork 时明确密钥继承策略（显式传递 vs 默认不传递） | 高 |
| 请求验证错误脱敏模式值得直接复用 | 中 |
