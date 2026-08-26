# DeepSeek Harness — License Notes

## 1. 主仓库许可证

- `[F]` **MIT License**，`Copyright (c) 2026 DeepSeek`（[LICENSE:1-3](../../sources/deepseek-harness/LICENSE#L1-L3)）。
- `[F]` 第三方依赖许可证披露于 [THIRD_PARTY_NOTICES.md](../../sources/deepseek-harness/THIRD_PARTY_NOTICES.md)（15.8 KB）。

## 2. Vendored 依赖

- `[F]` `vendor/` 是 source-vendored Cordis 框架：cordis（4.0.1）/ cosmokit / schemastery / timer / logger-console / hmr / loader / group / include。
- `[F]` vendored 包 rescope 到 `@deepseek-ai/*` 命名空间并 `private: true`（pnpm-workspace.yaml）。
- `[F]` Cordis 上游为 [cordiverse/cordis](https://github.com/cordiverse/cordis)，设计见论文《A Programming Paradigm for Spatiotemporal Composability》[github.com/cordiverse/paper](https://github.com/cordiverse/paper)。
- `[I]` 上游 Cordis 许可证为 MIT（cordiverse/cordis 仓库），但 DeepSeek 版本存在本地修改（vendor/README.md「Local modifications」）。

## 3. 复用分类

| 对象 | 分类 | 说明 |
|---|---|---|
| 整体架构思想（一切皆插件 / capability seam / append-only log / fail-closed） | **DESIGN_ONLY** | 只参考接口与模式，不复制实现。符合 SKILL「分离设计与代码」原则。 |
| DeepSeek Harness 具体源码（agent-loop / tools / session / sandbox） | **DESIGN_ONLY** | MIT 允许复用，但研究目标是模式而非复制代码；复制需保留 MIT 声明。 |
| Cordis 框架（vendored） | **LEGAL_REVIEW_REQUIRED** | 若要直接复用 Cordis，需在“上游 cordiverse/cordis（MIT）”与“DeepSeek vendored 版本（含本地修改）”之间选择并复核本地修改的许可证归属。 |

## 4. 复用边界结论

- `[R]` RoboThree **不**应直接复制 DeepSeek Harness 代码（无论是产品代码还是第三方 vendor），只提取设计思想与接口模式。
- `[R]` 若未来 RoboThree 要采用“插件框架”底层，优先评估**上游 cordiverse/cordis**（MIT）而非 DeepSeek 的 vendored 分支，以避开 DeepSeek 本地修改的归属与漂移问题。
- `[R]` 本研究中所有源码引用（file:line）仅用于证据标注，不构成代码复用。

## 5. 记录

- 研究目标 Commit：`47f943859bef60e4160492346772ded9b24f765a`。
- 许可证初查日期：2026-08-14。
- 未触发 § 5.1 的“升级为完整 license-review.md”条件（本研究不准备直接复用/修改/分发代码；但 Cordis 复用属 LEGAL_REVIEW_REQUIRED，单独标注）。
