# RoboThree 开发记录

本目录记录每一批有效代码开发及独立验收结果，供 Codex、Claude Code 和人工开发者交叉验证。

## 记录分层

| 记录 | 作用 |
| --- | --- |
| 根 `README.md` | 当前开发版本、阶段和最新验证入口 |
| `DEVELOPMENT-LOG.md` | 每一批代码的范围、来源、测试结果、缺口和下一道门槛 |
| 根 `CHANGELOG.md` | 跨开发者阅读的高层逻辑变更摘要 |
| `docs/architecture/UPSTREAM-ADOPTION-REGISTER.md` | 上游来源、固定 Commit、许可证、采用方式和目标文件 |
| `docs/development/qa/` | Claude Code 或其他独立验收者形成的版本化 QA 报告 |

## 开发版本规则

Kernel Alpha 开发阶段使用：

```text
0.0.0-kaf.<stage>.<batch>
```

- `stage`：KAF 阶段编号，例如 KAF-0 为 `0`、KAF-1 为 `1`；
- `batch`：该阶段中完成并通过开发者自测的代码批次，从 `1` 递增；
- 只改讨论文档且不影响代码、Contract、依赖或验证基线时，不强制升级开发版本；
- 修改生产代码、Contract、依赖、构建、迁移、安全或测试基线时，必须升级开发版本并追加开发日志；
- 进入正式 Alpha/Beta/Release 后另建正式发布版本，不沿用内部 KAF 编号。

Desktop/Central Foundation 使用独立阶段前缀：

```text
0.0.0-dcf.<stage>.<batch>
0.0.0-cgf.<stage>.<batch>
```

Foundation 验收后的局部工程修复使用
`0.0.0-<line>.<stage>.<batch>-repair.<n>`，不得借 repair 名义提前实现下一批
业务能力。

开发版本、Contract Version 和产品文档版本相互独立：

```text
开发版本：0.0.0-kaf.2.3
Contract Version：v1alpha1
产品与架构基线：v1.0
```

## 每批开发必须记录

1. 版本、日期、阶段、开发者和状态；
2. 本批目标与明确不包含的范围；
3. 主要新增或修改的模块；
4. 上游参考条目和采用方式；
5. 测试环境、命令和结果；
6. 已知缺口、风险和下一道 ADR/阶段门槛；
7. 独立 QA 状态和报告链接。

## 独立 QA 规则

- 独立 QA 不覆盖原开发者的自测结果；
- QA 报告按 `<version>-<reviewer>-qa.md` 保存到 `qa/`；
- 第一轮独立验收只报告问题，不修改产品业务代码；
- 如用户授权修复，修复形成新开发批次或在报告中明确修复验证范围；
- QA 结束后在 `DEVELOPMENT-LOG.md` 对应版本追加报告链接和结论。
