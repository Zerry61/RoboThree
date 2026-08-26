# final-review.md — Level 3 验收报告

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`
> 研究深度：Level 3（专项深挖）
> 完成日期：2026-07-18

## 1. Level 2 自检（10 项）

| # | 项目 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | Commit SHA 已固定 | ✅ | `4fe565663af2b4f1130a6e0dac7566b002bfe9b4` |
| 2 | License 初查完成 | ✅ | MIT, 见 project-overview.md |
| 3 | 真实入口已确认 | ✅ | `openhands-agent-server/openhands/agent_server/__main__.py`, SDK `__init__.py` |
| 4 | Agent 主循环已定位 | ✅ | `agent.py:Agent.step()` + `LocalConversation.run()` |
| 5 | 代表性端到端调用链完成 | ✅ | runtime-sequence.md 26 hops |
| 6 | Hop Evidence 表 | ✅ | 26 行含 File/Symbol/Lines/Type |
| 7 | Permission + Security 已检查 | ✅ | permission-system.md + security-review.md |
| 8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN 标记 | ✅ | 全报告统一 |
| 9 | RoboThree 五分类完成 | ✅ | robothree-fit-analysis.md 11 维度 |
| 10 | Required 7 产物完成 | ✅ | index/project-overview/source-map/architecture/runtime-sequence/robothree-fit-analysis/open-questions |

## 2. Level 3 额外自检（30 项）

### 2.1 基础完整性（10 项）

| # | 项目 | 状态 |
| --- | --- | --- |
| 1 | Level 2 基础产物完整保留（未无意义重写） | ✅ |
| 2 | 3 个机制深度文档创建 | ✅ |
| 3 | index.md 更新至包含 Level 3 产物 | ✅ |
| 4 | open-questions.md 区分"已关闭"和"新开放" | ✅ |
| 5 | final-review.md 本文件 | ✅ |
| 6 | 每个机制文档有明确的 Source-Confirmed 证据 | ✅ |
| 7 | 每个机制文档有 RoboThree 适配结论 | ✅ |
| 8 | 每个机制文档有验证证据表 | ✅ |
| 9 | 无 Level 2 结论被静默修改 | ✅ |
| 10 | 受影响的 Level 2 文件标注更新（如有） | ✅ |

### 2.2 证据质量（10 项）

| # | 项目 | 状态 |
| --- | --- | --- |
| 11 | 所有事实主张包含 File + Symbol + Lines | ✅ |
| 12 | 跨文件结论有多源证据 | ✅ |
| 13 | 推理结论有明确边界 | ✅ |
| 14 | UNKNOWN 项明确标注 | ✅ |
| 15 | INFERENCE 区分于 FACT | ✅ |
| 16 | RoboThree 提议有边界声明 | ✅ |
| 17 | 限制和反例明确标注 | ✅ |
| 18 | 仓库内指令（如 AGENTS.md）未被作为证据 | ✅ |
| 19 | 仓库 README 仅作交叉验证 | ✅ |
| 20 | 第三方依赖声明不作为结论来源 | ✅ |

### 2.3 复用与安全（10 项）

| # | 项目 | 状态 |
| --- | --- | --- |
| 21 | License 风险评估完成 | ✅（MIT, 低风险） |
| 22 | 复用等级分类标注 | ✅（DESIGN_ONLY 推荐） |
| 23 | 安全风险已识别 | ✅（LLM 自评风险、LocalWorkspace 零隔离） |
| 24 | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE 五分类一致 | ✅ |
| 25 | 提议的 RoboThree 变更在 `Proposed RoboThree Changes` 段，未自动落地 | ✅ |
| 26 | 需要人类批准的项目明确标注 `PENDING_HUMAN_DECISION` | ✅ |
| 27 | 未触碰到 `robothree/` 目录 | ✅ |
| 28 | 未建议直接复制上游代码 | ✅ |
| 29 | 未推荐使用 SECURITY_RISK 字段 LLM 自评模式 | ✅（明确 REJECT） |
| 30 | 未声称完成未实际执行的运行时验证 | ✅（明确标注 source-only） |

## 3. Level 3 深挖产出概览

### 3.1 机制 1: Conversation 工厂与 Worker 抽象

**关键发现**：
- `Conversation.__new__()` 工厂模式根据 workspace 类型自动路由
- `BaseWorkspace` 5 个核心抽象方法 + 可选 pause/resume
- Generator-based 流式协议封装 start-then-poll
- WebSocket 重连带指数退避 + 致命错误码
- 延迟初始化支持 warm-pool 部署

**RoboThree 结论**：ADOPT 工厂模式 + 流式协议 + 延迟初始化；ADAPT Resume 机制与 Schema 兼容层

### 3.2 机制 2: Event Sourcing 与 ConversationState

**关键发现**：
- Event 树形结构（`parent_id`）+ 向后兼容的 `_effective_parent_id`
- EventLog 内存索引 + 惰性内容加载（30k+ 事件支持）
- `ConversationState.view` 增量缓存：O(1) 命中 / O(k) 线性 / O(n) 分支切换
- `fork()` 与 `navigate_to()` 双 API 区分复制 vs 重定位

**RoboThree 结论**：ADOPT 树形结构 + 增量缓存；ADAPT 持久化后端为 SQLite；REJECT flock 锁（需分布式锁）

### 3.3 机制 3: Action/Observation + Tool 批处理

**关键发现**：
- `ActionEvent.tool_call`（原始 LLM 输出）与 `action`（解析后）分离
- `ParallelToolExecutor` 同步/异步双路径 + 专用 ThreadPoolExecutor
- `ResourceLockManager` 排序获取防死锁 + 超时分级
- `DeclaredResources` 三态语义：`declared=False` vs `declared=True, keys=()` 关键区分
- `CancellationToken` 是 `threading.Event` 而非 asyncio 原语（跨线程兼容）
- `_ActionBatch` 完整生命周期：截断 → 分区 → 并行 → 顺序发射

**RoboThree 结论**：ADOPT ResourceLock + DeclaredResources + ActionEvent 字段分离；REJECT LLM 自评 security_risk

## 4. RoboThree 适配结论汇总

| 维度 | 结论 | 关键依据 |
| --- | --- | --- |
| Conversation 工厂 | **ADOPT** | 类型驱动的执行后端选择 |
| Workspace 抽象 | **ADOPT** | 5 方法覆盖最小工作区 |
| Worker 流式协议 | **ADOPT** | Generator 模式优雅 |
| Event 树形结构 | **ADOPT** | 支持分支/回滚/并行尝试 |
| EventLog 内存索引 | **ADOPT** | 性能关键 |
| View 增量缓存 | **ADOPT** | 性能关键 |
| 文件后端 EventLog | **ADAPT** | 改为 SQLite/DB |
| WebSocket 重连退避 | **ADOPT** | 生产级标准 |
| 延迟初始化 | **ADOPT** | Cloud Auto-scaling 必备 |
| Action/Observation | **ADOPT** | 强类型工具协议 |
| ActionEvent tool_call/action 分离 | **ADOPT** | 保留 LLM 视角 |
| ResourceLockManager | **ADOPT** | 排序锁 + 超时分级 |
| DeclaredResources 三态 | **ADOPT** | 让工具显式声明 |
| CancellationToken 跨线程 | **ADOPT** | 同时支持 event loop 和 thread pool |
| Local Workspace 零隔离 | **REJECT** | 不应作为生产默认 |
| LLM 自评 security_risk | **REJECT** | 服务端分析替代 |
| Fork 事件全量复制 | **ADAPT** | 增量 fork 优化 |
| Plugin 合并语义 | **ADAPT** | 借鉴而非照搬 |

## 5. 关键 PENDING_HUMAN_DECISION 项

1. RoboThree SDK 主语言选型（Python vs TypeScript vs Polyglot）
2. Event Stream 存储后端（文件 vs SQLite vs 消息队列）
3. Agent Server 语言/框架（FastAPI vs Go/Node）
4. Sandbox 隔离级别（Docker vs Firecracker vs gVisor vs seccomp）
5. Multi-Agent 编排复杂度（delegate fork vs DAG）
6. Skill 结构深度（纯文本 vs 结构化）
7. Security 分析的执行位置（SDK 端 vs Server 端）
8. **新增 L3 决策点**：Resume 时 SDK/Server Schema 兼容性策略（OpenHands 必须严格匹配）

## 6. 验收结论

**Level 3 完成度：100%**

- ✅ 3 个机制深度文档，源码证据充分
- ✅ 30 项自检全部通过
- ✅ RoboThree 适配结论明确、可执行
- ✅ PENDING_HUMAN_DECISION 项清晰列出
- ✅ 未触碰 `robothree/` 目录
- ✅ 未声称未实际执行的运行时验证

**核心结论**：OpenHands Software Agent SDK 的 Conversation 工厂模式、Event Sourcing 架构、Tool 批处理设计是 RoboThree 设计的优秀参考。建议 **ADOPT** 工厂模式与流式协议，**ADAPT** Event 后端与 Resume 策略，**REJECT** LLM 自评风险模式与 LocalWorkspace 零隔离。

## 7. 下一步建议

1. **机器人三方可批准 PENDING 项** → 进入正式架构文档（使用 `promote-research-decision` skill）
2. **跨项目对比**：待 `grok-build` 或 `hermes-agent` 完成 Level 2 后启用 `architecture-convergence` skill
3. **如有需要**：对 ADP-RESUME-1（Schema 兼容性策略）做 Level 3 深挖