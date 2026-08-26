# 端到端示例：HTML 本机预览

> 展示从功能补充 → 原型需求 → 验收设计的完整链路。Quick 模式输出。

## A. 功能补充与评审

用户需求："员工让 RoboThree 做一个产品介绍网页，做完后本机预览。修改意见后增量更新，关闭应用时停止预览。"

### 功能规格（feature-spec.md，Quick）

**FR-001** [PROPOSAL] 用户通过 Chat 描述网页需求，Core 生成 HTML/CSS/JS 到 Workspace。
- 关联不变量：INV-LOCAL-02（场景不进 Core）
- [FACT] HTML 是 KA-2 验证载体（ADR-003）

**FR-002** [DECISION] 预览服务监听 127.0.0.1，退出应用后停止（基线 §11.4）。

**FR-003** [PROPOSAL] 增量修改时创建 `.prev` 备份，用户可撤销（基线 §11.3）。

**FR-004** [DECISION] 禁止公网监听（基线 §11.4）。

**状态与异常**：

| 状态 | 行为 | TaskState |
| --- | --- | --- |
| 正常生成 | 文件落盘 Workspace | Succeeded |
| 预览启动 | localhost:PORT | — |
| 修改+备份 | .prev 备份 → 增量写入 | Running |
| 撤销 | .prev 覆盖当前 | — |
| 退出 | 端口释放 | — |
| 权限不足 | 提示 WorkspaceGrant | — |
| 端口冲突 | 提示换端口 | — |

**架构影响摘要**：

| 对象 | 影响 | 当前状态 |
| --- | --- | --- |
| Contract（Artifact/PreviewSession） | 必须修改 | TBD（PROPOSED） |
| Tool Runtime | 必须修改 | TBD（KAF-3） |
| Worker Manager | 必须修改 | TBD（KA-1） |

**开发准备度**：NOT_READY — 依赖 KAF-1～KAF-5 + KA-2 集成。

**待确认**：预览浏览器选择（WebView/系统浏览器）、.prev 保留时长。

## B. 原型需求

### 原型规格（prototype-spec.md，Quick）

**页面**：PG-001 Artifact 文件列表 + 预览面板

**用户流程**：
```
Chat 输入需求 → 等待生成 → 文件列表展示
                           → 点击预览 → localhost 启动 → 查看页面
                           → 输入修改 → .prev 备份 → 增量更新 → 刷新预览
                           → 关闭应用 → 预览停止
```

**字段**：预览按钮 "在本机预览"，撤销按钮 "撤销修改"

**页面状态**：

| 状态 | 显示 | 操作 |
| --- | --- | --- |
| 加载 | 进度 + "正在生成" | 取消 |
| 空 | 无 Artifact | — |
| 已生成 | 文件列表 + 预览/撤销按钮 | 预览/撤销 |
| 预览运行 | URL + 页面 + 状态指示 | 停止 |
| 权限不足 | "无权访问 Workspace" | 申请权限 |

**原型验收点**：
1. 文件生成后文件列表即时展示，预览按钮可点击
2. 预览 URL 仅 127.0.0.1，局域网不可达
3. 应用退出后端口释放

## C. 验收设计

### 验收（acceptance.md，Quick — 仅设计标准）

**AC-001 生成 HTML 并预览**

- 前置：WorkspaceGrant 已授权
- 步骤：1. Chat 输入网页需求；2. 等待生成；3. 点击预览
- 预期：文件落盘 Workspace；localhost:PORT 可访问；127.0.0.1 仅本地
- 证据要求：L3 — 截图 + 文件内容 + 端口监听检查

**AC-002 增量修改 + 撤销**

- 步骤：1. 输入修改意见；2. 文件更新；3. 点击撤销
- 预期：.prev 备份存在；撤销后内容恢复
- 证据要求：L3 — 文件 diff + 截图

**AC-003 退出停止预览**

- 步骤：1. 退出应用
- 预期：端口释放；127.0.0.1:PORT 不可达
- 证据要求：L3 — netstat + 进程日志

**当前验收状态**：Unverified（L1 — 文档一致性检查通过）。KA-2 实现后移交 `independent-qa-acceptance` 执行 L3。

---

## 补充片段：任务暂停（简要）

> 来自原 task-pause-example.md，精简为片段。

**需求**：Running 状态暂停，恢复到断点。[PROPOSAL] 映射到 WaitingForInput（基线已确认状态，不新增 TaskState）。依赖 ADR-005/007 冻结。开发准备度 NOT_READY。

## 补充片段：高风险 Tool 审批（简要）

> 来自原 tool-approval-example.md，精简为片段。

**需求**：高风险 Tool 调用前触发 Approval。[DECISION] Approval 绑定 Plan Revision + Step + Action + 资源范围（INV-LOCAL-16）。[PROPOSAL] 分层模型待 ADR-006 冻结。开发准备度 NOT_READY。
