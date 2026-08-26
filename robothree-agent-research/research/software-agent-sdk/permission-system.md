# permission-system.md — Permission 与安全执行

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. 安全分析器 (SecurityAnalyzer)

### 1.1 架构

```python
class SecurityAnalyzerBase(ABC):
    def analyze_pending_actions(
        self, action_events: list[ActionEvent]
    ) -> list[tuple[ActionEvent, SecurityRisk]]: ...
```

安全分析器对每个待执行的 Action 输出风险评级：
- `LOW` — 低风险（如读文件）
- `MEDIUM` — 中风险（如网络请求）
- `HIGH` — 高风险（如执行 shell 命令）
- `UNKNOWN` — 无法确定（无安全分析器时的默认值）

证据 — [security/analyzer.py](openhands-sdk/openhands/sdk/security/analyzer.py)

### 1.2 风险来源

安全风险由 LLM 在工具调用参数中的 `security_risk` 字段初步填充：

```python
def _extract_security_risk(arguments, read_only_tool, security_analyzer):
    if read_only_tool:
        return SecurityRisk.UNKNOWN  # 只读工具不评估风险
    if security_analyzer is None:
        return SecurityRisk.UNKNOWN  # 无分析器则跳过
    return SecurityRisk(arguments.pop("security_risk", None) or "unknown")
```

**关键设计决策**：LLM 填写的 `security_risk` 只在存在安全分析器时才被采纳。无分析器时所有风险默认为 UNKNOWN。[F]

证据 — [agent.py:1034-1059](openhands-sdk/openhands/sdk/agent/agent.py#L1034-L1059)

## 2. 确认策略 (ConfirmationPolicy)

### 2.1 策略接口

```python
class ConfirmationPolicyBase(ABC):
    def should_confirm(self, risk: SecurityRisk) -> bool: ...
```

当 `_requires_user_confirmation()` 返回 `true` 时：
- `state.execution_status = WAITING_FOR_CONFIRMATION`
- Agent 暂停，等待用户显式调用 `run()` 确认
- 再次调用 `run()` 时，待处理的 Action 被执行

证据 — [agent.py:991-1032](openhands-sdk/openhands/sdk/agent/agent.py#L991-L1032)

### 2.2 确认绕过规则

以下情况**不需要**用户确认：
1. 单个 `FinishAction`（标记完成）
2. 单个 `ThinkAction`（纯思考）
3. 所有 Action 的安全风险低于策略阈值

证据 — [agent.py:1003-1007](openhands-sdk/openhands/sdk/agent/agent.py#L1003-L1007)

## 3. Hook 级安全拦截

Hook 系统的 `pre_action` 钩子提供**执行前拦截**：
- Hook 可以返回 `blocked_reason` 阻止工具执行
- 被阻止的 Action 产生 `UserRejectObservation` 而非正常 Observation
- 阻止原因记录在事件中，Agent 可据此调整行为

证据 — [agent.py:300-317](openhands-sdk/openhands/sdk/agent/agent.py#L300-L317)

`pre_user_message` 钩子可以**阻止用户消息**：
- 阻止原因写入 `state.blocked_messages`
- Agent step 检查到被阻止的用户消息后直接 FINISHED

证据 — [agent.py:633-643](openhands-sdk/openhands/sdk/agent/agent.py#L633-L643)

## 4. 执行边界

### 4.1 Workspace 层隔离

| Workspace | 进程隔离 | 文件系统隔离 | 网络隔离 |
| --- | --- | --- | --- |
| LocalWorkspace | 无 | 无（直接主机 FS） | 无 |
| DockerWorkspace | 容器 | 容器卷 | 可配置 |
| ApptainerWorkspace | 容器 | 容器卷 | 可配置 |
| CloudWorkspace | VM | VM 磁盘 | 云网络 |
| RemoteAPIWorkspace | API 边界 | API 边界 | API 边界 |

### 4.2 密钥管理

- `SecretRegistry` 管理会话级密钥
- `StaticSecret` / `LookupSecret` 两种密钥源
- 密钥通过 `Cipher` 加密持久化
- MCP 配置中的 `${VAR}` 引用在运行时展开

证据 — [secret_registry.py](openhands-sdk/openhands/sdk/conversation/secret_registry.py)

## 5. RoboThree 启示

| 方面 | 评价 |
| --- | --- |
| LLM-fill security_risk | 创新但有风险——LLM 可能低估自己调用的危险性 |
| 确认策略双层模型 | 清晰的设计：Analyst 评级 + Policy 决策 |
| Hook 拦截 | 比纯 confirmation dialog 更灵活，支持自动化安全策略 |
| Workspace 隔离 | LocalWorkspace 无隔离是明显的安全漏洞（设计选择） |
