# Security Review

> Threat Model 与逐项检查清单。
> 对应 `templates/security-review.md` 与 `templates/permission-system.md`。

---

## 1. Threat Model 总览

| 类别 | 主要风险 |
| --- | --- |
| **未知代码仓库** | `npm install` 触发 `postinstall`，写入 `~/.bashrc`、`/etc/`。 |
| **Prompt Injection** | 仓库 README / Issue / Tool Result / 网页内容注入恶意指令。 |
| **Tool Injection** | Tool Result 拼到 System Prompt。 |
| **Command Injection** | Shell 调用未转义参数。 |
| **Path Traversal** | `../`、symlink、`/etc/passwd`。 |
| **Secret Leakage** | 环境变量、API Key、token 出现在日志 / 报告。 |
| **Data Exfiltration** | Tool 把 `.ssh/`、`~/.aws/` 上传。 |
| **Remote Tool** | 远程 MCP / 远程 Sandbox 被劫持。 |
| **MCP Server Trust** | 第三方 MCP Server 静默调用工具。 |
| **Browser** | 自动下载、自动填写表单、跨域。 |
| **Desktop Control** | 模拟键鼠、剪贴板、屏幕读取。 |
| **Subagent 权限继承** | Subagent 拥有父级全部权限。 |
| **Background Task** | 绕过前台 UI 确认执行 Tool。 |
| **Multi-user Isolation** | 跨租户数据共享。 |
| **Supply Chain** | 依赖混淆、typosquat、preinstall 脚本。 |
| **Dependency Script** | `preinstall` / `install` / `postinstall` / `prepare`。 |
| **Malicious Plugin** | 第三方 Plugin 写恶意代码。 |
| **Malicious Skill** | SKILL.md 隐藏的 prompt injection。 |
| **Malicious Memory** | 从外部写入 memory，让下次读取触发恶意行为。 |
| **Malicious Tool Result** | Tool 在 `stdout` 内嵌 system-style 指令。 |
| **Remote Worker Trust** | Worker 拿到错误任务时执行。 |
| **Workspace Escape** | chroot / namespace 绕过。 |
| **Container Escape** | Docker socket / privileged container。 |
| **Audit Gap** | 没有持久化日志，无法追溯。 |

---

## 2. 必查项清单

### 2.1 代码执行

- [ ] Shell 执行是否走 `shell:false` / `argv` array。
- [ ] 参数是否经过 shell-escape 或 ast.literal_eval。
- [ ] 是否限制 `--` 之后的 flag 越权。
- [ ] 是否禁用 `curl ... | bash`。
- [ ] 是否禁用 `git config --global` / `pip install --user`。

### 2.2 文件系统

- [ ] 是否限制在 Workspace 内。
- [ ] 是否 canonicalize 路径（防 symlink）。
- [ ] 是否阻止读写 `~/.ssh`、`~/.aws`、云 metadata 服务 IP。
- [ ] 是否阻止 `..` 跳出。
- [ ] 是否阻止 device file、socket、procfs。

### 2.3 网络

- [ ] 是否允许任意 URL。
- [ ] 是否有限定 domain allowlist。
- [ ] 是否对 `169.254.169.254`（云 metadata）做拦截。
- [ ] 是否对 `localhost` / `127.0.0.1` / 内网网段做拦截。

### 2.4 Secret 处理

- [ ] 是否读取 `~/.aws/credentials`、`~/.ssh/id_rsa`。
- [ ] 是否在日志里打印 Secret。
- [ ] 是否在 Tool Result 里泄露 Secret。
- [ ] 是否写入明文到 SQLite / JSON。

### 2.5 Prompt Injection 防御

- [ ] Tool Result 是否作为不可信 content block。
- [ ] 是否隔离 system / user / tool 三个 channel。
- [ ] 是否对外部网页内容做 sanitization。
- [ ] 仓库内 `AGENTS.md`、`README.md` 是否默认被 Tool 读取且解析为指令。
- [ ] 是否对 memory 内容做 allowlist 验证。

### 2.6 Tool / Skill / Plugin / Memory / MCP Trust

- [ ] Skill 是否可自动加载并修改 System Prompt。
- [ ] Plugin 是否需要签名 / hash 校验。
- [ ] Plugin install 时是否执行任意 shell。
- [ ] Memory 写入是否需要用户审批。
- [ ] MCP Server 是否由用户显式 trust-on-first-use。
- [ ] 是否暴露敏感 Tool（filesystem.write、shell.exec）给普通 Skill。

### 2.7 Subagent / Background Task

- [ ] Subagent 是否继承父 Agent 全部权限。
- [ ] Subagent 是否可访问父 Agent 的历史消息。
- [ ] Background task 是否绕过前台 UI 确认。
- [ ] Auto Resume 是否会重放历史 Tool 调用。

### 2.8 多用户

- [ ] Session Storage 是否按用户隔离。
- [ ] File Watcher 是否只读用户 workspace。
- [ ] Tool API Key 是否 per-user。

### 2.9 Browser / Desktop / Mobile

- [ ] 是否允许打开本地文件对话框。
- [ ] 是否允许自动下载。
- [ ] 是否允许 clipboard 写入。
- [ ] 是否允许 desktop 模拟键鼠。
- [ ] 是否允许 screen capture。

### 2.10 Remote Worker / Daemon

- [ ] 认证是 mTLS / Token / 无认证。
- [ ] 是否 per-task 鉴权。
- [ ] 是否允许 Worker 反向连接 Control Plane。
- [ ] 是否限制 Worker 拉数据范围。

### 2.11 Audit

- [ ] 是否持久化每次 Tool Call（参数 / 结果）。
- [ ] 是否持久化权限批准记录。
- [ ] 是否提供审计 API。
- [ ] 是否对超长 Tool Result 截断。

### 2.12 Dependency / Supply Chain

- [ ] 是否使用 lockfile。
- [ ] CI 是否做 hash 验证。
- [ ] 是否做 license 审计。
- [ ] 是否限制 npm/pip 镜像 source。

---

## 3. 常见 CVE / 风险类型

- **Tar / Zip Path Traversal**: `tar -xf evil.tar --no-same-owner` 写任意路径。
- **Pip Install URL**: `pip install git+https://...` 触发任意代码。
- **npm Lifecycle Script**: `npm install` 默认执行 `preinstall`、`postinstall`。
- **Git Config Poisoning**: `--upload-pack`、`core.sshCommand`。
- **Symlink Race**: `ln -s /etc/passwd ./evil`。
- **Server-Side Request Forgery (SSRF)**: 模型生成 URL，Tool 内 fetch 触发内网访问。
- **Path injection**: 未 canonicalize 的 `~`、环境变量。
- **File write via Tool**: Tool 可以改 source code → supply chain。
- **MCP Resource exhaustion**: 巨型 schema / 大 payload。
- **Memory poisoning**: Tool 写入 memory 后下次读取触发恶意行为。

---

## 4. 安全信号搜索模板

```bash
# 危险命令
rg -n "shell|exec|spawn|Runtime\\.exec|child_process|os.system|subprocess" <runtime-dir>

# 危险路径
rg -n "~/.ssh|~/.aws|/etc/passwd|/proc/self" <runtime-dir>

# 危险 fetch
rg -n "fetch\\(|axios|requests\\.get|http\\.get" <runtime-dir>

# Secret 管理
rg -n "process\\.env|os\\.environ|getenv|keyring" <runtime-dir>

# Prompt 拼接
rg -n "systemPrompt\\s*\\+|appendMessages|addSystemMessage" <runtime-dir>

# 权限拦截点
rg -n "permission\\.check|requireApproval|policy\\.evaluate" <runtime-dir>
```

---

## 5. 对 RoboThree 的影响映射

| 风险 | RoboThree 模块 | 默认策略 |
| --- | --- | --- |
| Shell 命令注入 | Sandbox + Tool Permission | default-deny + workspace 内 allowlist |
| 文件读写越界 | Workspace Manager | canonicalize + deny `~/.ssh` 等 |
| Tool Result 注入 | Context Engine | 视为不可信 content，单独 channel |
| Prompt 拼接 | Context Engine | 严格 system / user / tool 分层 |
| Subagent 继承权限 | Subagent Runtime | 按角色降级 + 显式 allowlist |
| Background Task 绕过 | Permission Engine | Reject by default |
| MCP Server Trust | MCP Host | explicit trust on first use |
| 远程 Worker 拉数据 | Enterprise Control Plane | per-task auth + scope |
| Browser / Desktop | Desktop Agent | 默认 sandbox + explicit approval |
| Memory 注入 | Memory Engine | write-time schema 校验 + approval |
| Secret 处理 | Identity and Access | 不落地明文；最小读取；redact log |

---

## 6. 安全分析产物

研究完成后，生成：

1. `research/<project>/security-review.md`：每项检查结果的 Evidence + 风险等级。
2. `research/<project>/permission-system.md`：拦截点与策略。
3. 在 `reusable-patterns.md` 列出可借鉴的安全设计。
4. 在 `risks-and-limitations.md` 列出 RoboThree 不要照搬的反模式。
5. 必要时起草 ADR `robothree/adr/<NNNN>-<slug>.md`。

---

## 7. 安全自检（每次研究结束前）

- [ ] 是否对每个 Permission 检查点标注 Evidence？
- [ ] 是否对每个 Tool 调用标注超时 / 取消 / 重试？
- [ ] 是否分析了 Secret 落盘路径？
- [ ] 是否分析了 Prompt Injection 风险？
- [ ] 是否分析了 Subagent 权限继承？
- [ ] 是否分析了 Background Task 绕过？
- [ ] 是否分析了 MCP Trust 流程？
- [ ] 是否分析了 Remote Worker 信任？
- [ ] 是否在 `open-questions.md` 列了未确认项？
- [ ] 是否在 RoboThree 适配里给 ADOPT / ADAPT / DEFER / REJECT？
