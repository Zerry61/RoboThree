# LICENSE-NOTES — OpenCode

> **Repository**: https://github.com/opencode-ai/opencode
> **Target Ref**: commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
> **Research Date**: 2026-08-11

## 1. 主仓库许可证

| Aspect | Value |
|---|---|
| **License** | MIT |
| **Copyright Holder** | Kujtim Hoxha (2025) |
| **Source File** | [sources/opencode/LICENSE](../../sources/opencode/LICENSE) |
| **Full Text** | 20 行；标准 MIT 文本（保留版权 + 许可证声明，无担保） |

**[F]** MIT 许可证允许：

- 复制、修改、分发、再授权。
- 商业使用。
- 要求：保留版权 + 许可证声明。

## 2. 直接依赖许可证

[go.mod](../../sources/opencode/go.mod#L1-L33) 直接依赖（节选）：

| Dependency | License | 风险等级 |
|---|---|---|
| `anthropic-sdk-go` | MIT | NONE |
| `openai-go` | Apache-2.0 | NONE |
| `mcp-go` | MIT | NONE |
| `charmbracelet/bubbletea` | MIT | NONE |
| `ncruces/go-strftime` | MIT | NONE |
| `pressly/goose` | MIT | NONE |
| `spf13/cobra` | Apache-2.0 | NONE |
| `spf13/viper` | MIT | NONE |
| `google/uuid` | BSD-3-Clause | NONE |
| `lrstanley/bubblezone` | MIT | NONE |
| 其他 stdlib / 间接依赖 | 见 go.sum | 间接风险低 |

**[F]** 所有直接依赖均为 MIT / BSD / Apache-2.0 兼容许可；未发现 GPL / AGPL / 商业限制依赖。

## 3. 复用边界分类

按 [agent-architecture-research/SKILL.md §4.5](../../.claude/skills/agent-architecture-research/SKILL.md) 分类：

| RoboThree 借鉴机制 | 复用等级 |
|---|---|
| SQLite + Goose + sqlc 三栈 | DIRECT_REUSE（MIT） |
| Provider interface + channel event 抽象 | DESIGN_ONLY（参考接口） |
| Agent loop 整体结构 | DESIGN_ONLY（参考流程） |
| Message parts type-tag 序列化 | DESIGN_ONLY（参考 schema） |
| SQLite migrations 完整 SQL | ATTRIBUTION_REQUIRED（保留版权声明） |
| Subagent 同步等待 + cost 累加 | DIRECT_REUSE（MIT） |
| Provider retry 逻辑（429/529） | DESIGN_ONLY |
| Bash command denylist | NOT_RECOMMENDED（安全风险） |
| PersistentShell 完整实现 | NOT_RECOMMENDED（安全风险） |
| Non-interactive AutoApprove 模式 | NOT_RECOMMENDED（安全风险） |
| Permission channel 实现（无 timeout） | NOT_RECOMMENDED（安全风险 + 注释与实现不一致） |
| Path permission 字符串前缀判断 | NOT_RECOMMENDED（安全漏洞） |

## 4. LICENSE 风险评估

**[F]** **无 LICENSE_RISK**：

- 主仓库 MIT。
- 所有直接依赖 MIT / BSD / Apache-2.0。
- 无 Copyleft、无商业限制、无 SaaS 限制。

**[I]** **RoboThree 借鉴策略**：

- 直接复用 SQLite schema、Agent loop 模式、Provider interface 设计、tool dispatch 框架。
- 不复制第三方代码到 RoboThree 产品仓库。
- 不复制 persistent shell、permission channel 实现（安全风险）。
- 在正式 ADR / 架构文档中**标注"灵感来自 opencode-ai/opencode (MIT)"**作为来源。

## 5. 注意事项

- OpenCode 已**归档**，上游不再维护；MIT 许可证不限制 fork 与修改。
- 项目迁移到 Crush（Charm 团队），但 Crush 的许可证不在本研究范围。
- 如果 RoboThree 直接 fork OpenCode 源码（不推荐），需保留 LICENSE 文件 + copyright 声明。
- 如果 RoboThree 仅借鉴设计模式，无须任何许可证声明（接口、模式不受版权保护）。