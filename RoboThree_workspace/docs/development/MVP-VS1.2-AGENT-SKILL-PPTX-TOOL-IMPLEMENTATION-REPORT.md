# MVP VS1.2 Agent / Skill / PPTX Tool 实施报告

> 版本：`0.0.0-mvp.vs1.backend.2`  
> 状态：**PASS/CLOSED — USER ACCEPTED 2026-08-29**  
> 范围：MVP-VERTICAL-SLICE-1 的 VS1.2 联合子项；随 VS1.3 联合 QA 与用户接受正式关闭。

## 1. 交付结果

VS1.1 的 internal-trial 企业 Model 现已继续贯通以下真实执行链：

```text
agent.presentation
  -> exact Skill revision/contentDigest
  -> CPC Platform + Agent + Skill 单一 System Message
  -> exact PPTX Tool entitlement/policy/capability lock
  -> Gateway HTTP/SSE 返回模型 Tool Call
  -> Agent Loop 执行 tool.document.pptx.write
  -> Document Worker 生成真实 PPTX
  -> Tool Result 回到第二轮模型调用
  -> Task / Tool activity / Artifact projection completed
```

未配置完整 internal-trial deployment/token 时仍 fail-closed。`agent.general` 仍是唯一通用机器人入口；本批只新增
code-owned `agent.presentation` 专项 Agent 和一个受信本地 Skill，不创建通用 Skill Registry、安装、发布或审核能力。

## 2. 实现明细

### 2.1 CPC 与专项 Agent

- CPC 的 code-owned 默认值仍为 `false`；只在显式、完整的 internal-trial composition 中加法启用；
- 新增 `agent.presentation`（中文名“演示文稿助手”），对 Model、Skill 和 PPTX Tool 使用 exact allowlist；
- `agent.general` 与 `agent.presentation` 定义和执行路径严格分离，不新增第二个通用机器人；
- Agent 执行 repository 可按 durable exact revision 加载两者，不读取 current/latest alias。

### 2.2 可信本地 Skill

- 新增仓内受信 `skill.presentation-planning/SKILL.md`，包含保守的五页汇报结构与合法最小
  `PresentationSpecV1` 示例；
- resolver 只允许固定 trusted root 内的真实文件，校验 realpath containment、LF-normalized exact body、revision 和
  content digest；
- 选择后文件发生 byte drift、引用不匹配、路径越界、BOM/大小/格式异常均返回 unavailable，不读取 current fallback；
- Runtime Selection v1alpha4 中的 portable Skill ref 被逐字段投影，不使用 spread，也不把 `materializedRef` 写入 durable
  selection、Prompt、日志或 Gateway request。

### 2.3 PPTX Tool exact lock 与真实模型调用

- `tool.document.pptx.write` 的 Registry、Entitlement、Workspace/Authorization permission、Tool Policy 和 Capability
  Lock 使用同一个 exact capability revision；只有 `agent.presentation` 获得该 Tool；
- Provider Tool name 由 capability ID 确定性映射为 OpenAI-compatible 安全 machine name，并保留 digest suffix 防碰撞；
- Gateway 返回的真实 Tool Call 经 exact mapping 还原为 capability ID；Provider 在有 Tool Call 时输出
  `finishReason=tool_calls`，Agent Loop 因而进入 Tool execution，而不是错误提前完成；
- Document Tool 执行读取 readable Runtime Selection union，正确消费 v1alpha4，不建立 legacy selection 分支。

### 2.4 Durable acceptance 修正

- 首次接受中 selected Skill/Knowledge 由 Planner 逐字段投影到 strict accepted selection，移除 registry-only
  `stableOrdinal`；
- Task Instruction Binding 同时兼容历史 materialized Skill ref 与当前 portable exact ref；portable 路径仍由受信
  resolver 在执行时 exact 解析；
- 继续复用既有 R2D3/DFI541 acceptance、Task bundle、Agent Loop、Tool/Artifact persistence，没有第二套状态机或新表。

## 3. 运行级证据

### 3.1 VS1.2 focused chain

`vs1.1-internal-trial-enterprise-runtime.integration.test.ts` 和 `vs1.2-presentation-skill.test.ts` 使用 normal
`createDesktopPrivateRuntime`、真实 SQLite、真实 loopback Gateway HTTP/SSE 和真实 Document Worker Tool backend，证明：

1. Catalog 投影 `agent.presentation`、exact Skill、exact PPTX Tool；
2. client turn `vs1.2-presentation-0001` 的 Gateway request 含 Platform/Agent/Skill/Tool context，且不含本机路径或
   `materializedRef`；
3. client turn `vs1.2-pptx-tool-0001` 的第一轮 Gateway response 产生模型 Tool Call；
4. Core 在已授权 Workspace 中生成 `项目汇报.pptx`；
5. 第二轮 Gateway request 含 Tool Result，最终 Assistant Message 为“PPTX 已真实生成”；
6. 同一 runtime task detail 为 completed，Tool activity 为 completed，PPTX Artifact media type 与 preview state 正确；
7. 文件真实存在且非空。

最终复跑：2 files / 8 tests PASS。加入 Enterprise Provider 单测后，VS1.2 focused set 为 3 files / 37 tests PASS。

### 3.2 历史语义回归

CPC、R2D、Document Tool 与 Enterprise Provider 回归：10 files / 88 tests PASS。Core typecheck、14 个本批相关文件的
focused ESLint、DTP-4 packaging audit 均 PASS。

lockfile digest 仍为
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`，migration 仍止 26。

## 4. 八项 DoD 当前证据索引

| DoD | 运行级证据 | task / correlation | 当前结论 |
| --- | --- | --- | --- |
| 1 | normal Core composition，无 demo/legacy/scripted Provider | `vs1.2-pptx-tool-0001` | VS1.2 PASS；真实 Electron 由 VS1.3 验证 |
| 2 | Core 真实 Gateway HTTP/SSE；Central online/offline 已在 VS1.1 独立 QA 通过 | `vs1.2-pptx-tool-0001` | VS1.2 PASS；跨进程受控上游由 VS1.3 联合 E2E 关闭 |
| 3 | Catalog 与 durable selection exact 锁定 `agent.presentation`，规则进入 System Message | `vs1.2-presentation-0001` | PASS |
| 4 | `skill.presentation-planning` revision/contentDigest 锁定并进入单一 System Message | `vs1.2-presentation-0001` | PASS |
| 5 | Gateway fixture 通过真实模型响应协议产生 PPTX Tool Call；Core 未硬编码调用 | `vs1.2-pptx-tool-0001` | PASS |
| 6 | 已授权 Workspace 中生成真实非空 `项目汇报.pptx` | runtime-generated task ID | PASS |
| 7 | Core Task detail 中 Tool activity/Artifact 已 completed | runtime-generated task ID | Backend projection PASS；真实 Desktop 页面由 VS1.3 验证 |
| 8 | VS1.1 已证明 Conversation SQLite reopen；PPTX task/artifact 的真实 Electron restart | — | VS1.3 PENDING |

该表记录的是编码完成时的阶段证据。VS1.3 联合 E2E、最终聚焦 re-QA 与用户接受现已完成，VS1.2 正式
`PASS/CLOSED`；当前最高结论仍为 `MVP_VERTICAL_SLICE_1_E2E_CONFORMANT`，不单独输出
`MVP_VERTICAL_SLICE_1_USABLE`。

## 5. 本批发现并修复的真实阻断

1. OpenAI-compatible Tool name 不能使用带空格的展示名：改为确定性 provider-safe machine name；
2. Enterprise Provider 有 Tool Call 时仍输出 `finishReason=stop`：改为 `tool_calls`，使 Agent Loop 继续执行 Tool；
3. Document Tool execution 只按 v1alpha1 解析 Runtime Selection：改用现有 readable union 消费 v1alpha4；
4. portable Skill ref 曾被 strict binding/selection 拒绝：改为显式字段投影与可信 resolver exact 解析。

这些修正均属于现有垂直链的必要接线，没有扩张公共能力面。

## 6. 诚实边界

- 本报告确认的是 VS1.2 后端/Core 真实执行链，不等于公开 production ready；
- loopback Gateway fixture 验证 Core 对真实 HTTP/SSE/Tool Call contract 的消费，不冒充公开外部 Provider 凭证；
- VS1.3 仍需真实 Electron 页面、完整 Central/受控 Provider、Artifact UI 和 restart/replay 联合 E2E；
- 不新增公共 Contract、migration、依赖或 lockfile 变化；
- 不修改 Admin、Personal Model、TGM、Knowledge Provider、Agent Lifecycle 或无当前消费者的能力；
- production SSO/RBAC、公开 production identity 继续 GATED。

## 7. 下一步

在同一联合编码授权下直接进入 VS1.3：复用现有 Renderer Task/Tool/Artifact 页面，补真实 Electron → Core →
controlled Central/Provider → PPTX Tool → Artifact → restart E2E；只修复该场景暴露的接线问题，不创建新的 Foundation、
Contract 或阶段关闭矩阵。VS1.2 与 VS1.3 完成后统一进入一次独立代码 QA 和用户接受。
