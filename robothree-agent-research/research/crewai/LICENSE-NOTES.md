# CrewAI — License Notes

> **本文件目的**：记录 CrewAI 的许可证 + 子包 / 第三方嵌入代码的 License 状态 + 对 RoboThree 复用（含直接复制 / 派生 / 参考接口）的建议。
> **依据**：CLAUDE.md § 4.6 + SKILL.md § 4.5 复用等级。
> **结论**：CrewAI 上游是 MIT；RoboThree 可「DESIGN_ONLY」复用 + 「ATTRIBUTION_REQUIRED」可选项；**禁止直接复制上游**。

## 1. 主许可证

| Item | Value |
|---|---|
| License | **MIT License** |
| Holder | Copyright (c) 2025 crewAI, Inc. |
| Source | [sources/crewai/LICENSE](../../sources/crewai/LICENSE)（first 30 lines 已读） |
| Permissions | Commercial use · Modification · Distribution · Private use · Sublicense · Sell |
| Conditions | Include copyright + license copy in all copies/substantial portions |
| Limitations | No warranty · No liability |
| SaaS Restriction | **None** |
| Copyleft | **None** |
| Patent Grant | Implicit (MIT standard) |
| License Compatibility | MIT → Apache-2.0 / BSD / GPLv3 兼容 |

**License Snapshot**：单许可 MIT，符合「最宽松开源许可证」之一。

## 2. 子包 / 第三方嵌入代码

| 子包 | 路径 | License | 来源 | RoboThree 复用 |
|---|---|---|---|---|
| **`crewai`** (core) | `lib/crewai/` | MIT | 项目根 [LICENSE](../../sources/crewai/LICENSE) | **DESIGN_ONLY** |
| **`crewai-core`** | `lib/crewai-core/` | MIT（推断） | 项目根 LICENSE | **DESIGN_ONLY** |
| **`crewai-files`** | `lib/crewai-files/` | MIT（推断） | 项目根 LICENSE | **DESIGN_ONLY** |
| **`crewai-tools`** | `lib/crewai-tools/` | MIT（推断） | 项目根 LICENSE | **DESIGN_ONLY** — 注意此包累积大量第三方工具 wrapper（Serper / Brave / Exa / Browserbase / 等） |
| **`cli`** | `lib/cli/` | MIT（推断） | 项目根 LICENSE | **DESIGN_ONLY** |
| **`devtools`** | `lib/devtools/` | MIT（推断） | 项目根 LICENSE | **DESIGN_ONLY** |
| **`crewai-tools/` 第三方 wrapper** | `lib/crewai-tools/src/crewai_tools/tools/<provider>/` | 各自 SDK 许可证（如 Serper SDK Apache-2.0 / Exa Apache-2.0） | 仅 import；未嵌入源码 | **LEGAL_REVIEW_REQUIRED** |
| **`uv.lock`** | `uv.lock` | N/A | 锁文件；非源码 | N/A |

> **注**：未单独读取 `lib/crewai-tools/pyproject.toml` 中每个 provider tool 的 `dependencies` 字段；如果 RoboThree 计划复用任何 provider wrapper，**必须先读其上游 SDK License**。

## 3. 复用等级（SKILL.md § 4.5）

| 等级 | 定义 | RoboThree 适用 |
|---|---|---|
| `DIRECT_REUSE` | 可直接复用代码 | ❌ **禁止** — 复用必须经过人工审查 |
| `ATTRIBUTION_REQUIRED` | 需保留声明后复用 | ⚠ **可选** — 仅当复用极小段代码（≤ 10 行）+ 保留 MIT 头部 + 引用 [LICENSE](../../sources/crewai/LICENSE) |
| `DESIGN_ONLY` | 只能参考接口与模式 | ✅ **推荐** — 跨整个研究范围 |
| `LEGAL_REVIEW_REQUIRED` | 需要法律复核 | ⚠ **强制** — `crewai-tools/<provider>/` |
| `NOT_RECOMMENDED` | 不建议复用 | ❌ **不适用** |
| `ORIGINAL_ONLY` | 仅适用于原项目 | ❌ **不适用** |
| `LICENSE_RISK` | 存在许可证风险 | ❌ **不适用** |
| `SECURITY_RISK` | 存在安全风险 | ⚠ **适用** — Code-execution 类工具（详见 §6） |

## 4. 可借鉴的接口 / 模式（DESIGN_ONLY）

> **这些是设计参考，不是代码复用。RoboThree 应基于自己的设计原则重新实现。**

| 主题 | 来源文件 | 复用建议 |
|---|---|---|
| `Process` 枚举 + 多 dispatch | [process.py](../../sources/crewai/lib/crewai/src/crewai/process.py) | 仅枚举概念；RoboThree 自己设计 |
| `StorageBackend` Protocol seam | [memory/storage/backend.py](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py) | Protocol 接口；RoboThree 自行定义 |
| `BaseTool` 自动 schema 推导 | [tools/base_tool.py:207-254](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L207-L254) | 仅 Pydantic `create_model` 调用方式可参考；不复制 |
| `BaseAgentTool` 抽象 | [tools/agent_tools/base_agent_tools.py](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py) | 子类继承 `BaseTool` 的设计可参考 |
| `ToolFailure` 四元组 | [tools/tool_failure.py](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | 数据结构可参考 |
| `crewai_event_bus` 单例 | [events/](../../sources/crewai/lib/crewai/src/crewai/events/) | 订阅模型可参考 |
| `_enter_runtime_scope / _exit_runtime_scope` 嵌套 | [crew.py:1047-1086](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1047-L1086) | 嵌套隔离概念可参考 |
| Composite Score | [memory/types.py:345-379](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L345-L379) | 公式可参考 |

**禁止**：

- 直接复制 [crew.py](../../sources/crewai/lib/crewai/src/crewai/crew.py) / [agent/core.py](../../sources/crewai/lib/crewai/src/crewai/agent/core.py) / [task.py](../../sources/crewai/lib/crewai/src/crewai/task.py) / [process.py](../../sources/crewai/lib/crewai/src/crewai/process.py) 等大文件的全部或部分。
- 复制 `_TOOL_TYPE_REGISTRY` 全局注册机制（其全局状态设计被 RoboThree 标记为 DEFER）。
- 复制 `AgentTools.tools()` 工厂（其 role 字符串匹配被标记为 ADAPT；RoboThree 改为 ID 匹配）。
- 复制 `Manager must have no tools` 抛 Exception（被标记为 REJECT）。

## 5. 嵌入 / Vendor 代码

| 类型 | 状态 |
|---|---|
| `vendor/` 目录 | **未识别到** |
| `node_modules/` 类似结构 | **N/A** — Python 项目，无 `node_modules` |
| `generated/` | **未识别到** |
| Submodule (`.gitmodules`) | **未识别到** |
| 国内镜像 / Fork | **未使用** |

**结论**：CrewAI 是干净的开源 Python 项目，无大量嵌入第三方源码。**但** `crewai-tools/` 内的工具 wrapper 通过 `pip install <sdk>` 方式依赖第三方 SDK，**不复制其源码到 RoboThree**。

## 6. 安全 / Telemetry 警告

| 主题 | 状态 | RoboThree 影响 |
|---|---|---|
| `telemetry/` 匿名统计 | ✅ 存在 | 如果 RoboThree 复用任何 Telemetry 相关代码，**必须重写**或**禁用** opt-in |
| `plus_api.py` CrewAI+ 服务 | ✅ 存在 | 商业 API client；**禁止复用** |
| `auth/` OAuth | ✅ 存在 | **禁止复用** — 与上游账户绑定 |
| Code Execution Tools (`crewai-tools`) | ✅ 存在 | 安全风险；**RoboThree 必须中心化沙箱**（architecture.md §9） |

## 7. RoboThree 复用决策表

| RoboThree 模块 | 复用 CrewAI 设计 | 复用源代码 |
|---|---|---|
| **Multi-Agent Orchestration** | ✅ 借鉴 Process + Agent-as-Tool 设计 | ❌ 不复制 |
| **Memory 抽象** | ✅ 借鉴 Unified Memory + Backend seam | ❌ 不复制 |
| **Tool 系统** | ✅ 借鉴 BaseTool 自动 schema | ❌ 不复制 |
| **ToolFailure 模型** | ✅ 借鉴数据结构 | ❌ 不复制 |
| **EventBus** | ⚠ 借鉴订阅模型；RoboThree 已有 | ❌ 不复制 |
| **Telemetry** | ❌ 不复用 | ❌ 不复制 |
| **Plus API** | ❌ 不复用 | ❌ 不复制 |
| **Auth** | ❌ 不复用 | ❌ 不复制 |
| **CLI** | ❌ 不复用 | ❌ 不复制 |
| **crewai-tools/ 第三方** | ⚠ 仅参考 Tool Manifest 模式 | ❌ 不复制 |

## 8. 与 CLAUDE.md 的边界

- **本项目规则**（`CLAUDE.md` § 1, § 4）：研究 Skill。
- **不向 `robothree/` 写入**——所有复用建议仅写入 `research/crewai/robothree-fit-analysis.md §6`（Proposed Changes）。
- **不安装依赖、不运行项目**——本研究 100% 静态。
- **不得将上游代码复制到产品仓库**——见 §4 末段「禁止」。

## 9. License Risk 矩阵

| 风险维度 | 评级 | 说明 |
|---|---|---|
| **上游 License 变更** | LOW | MIT 极不可能变更 |
| **第三方嵌入代码** | MEDIUM | `crewai-tools/` SDK 许可证需逐一审查 |
| **商业 / SaaS 风险** | LOW | MIT 允许商业使用 |
| **Copyleft 风险** | NONE | MIT 无 Copyleft |
| **专利风险** | LOW | MIT 隐含专利许可 |
| **Author 行动风险** | LOW | crewAI, Inc. 是稳定公司 |
| **Data Collection 风险** | MEDIUM | Telemetry 行为需 opt-out |
| **Code Execution 风险** | HIGH | crewai-tools Code-interpreter 在主进程 |

**综合评级**：**LOW-MEDIUM**。

## 10. 总结

✅ **CrewAI 是干净的 MIT 项目**，对 RoboThree 而言：

- **DESIGN_ONLY 复用** 可借鉴其设计模式（Process / Unified Memory / BaseTool / Agent-as-Tool / ToolFailure）。
- **禁止源代码直接复制**到 RoboThree 产品仓库。
- **ATTRIBUTION_REQUIRED** 仅适用于 ≤ 10 行的极小片段，且必须保留 MIT 头部。
- **`crewai-tools/` 子包**（第三方 SDK wrappers）属于 `LEGAL_REVIEW_REQUIRED` 类别，RoboThree 团队如需复用任何 provider wrapper，**必须先审查上游 SDK License**。
- **Telemetry / Plus API / Auth** 全部 `NOT_RECOMMENDED`。
- **Code-execution 工具**涉及 `SECURITY_RISK`，RoboThree 中心化沙箱是必要动作。