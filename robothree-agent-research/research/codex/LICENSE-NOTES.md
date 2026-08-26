# License Notes — Codex CLI (openai/codex)

> Research target: https://github.com/openai/codex
> Commit: `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7` (2026-08-13)

## License Snapshot

| Field | Value |
|---|---|
| **Primary license** | Apache License 2.0 ([LICENSE](../../sources/codex/LICENSE)) |
| **Copyright holder** | OpenAI |
| **NOTICE** | Present ([NOTICE](../../sources/codex/NOTICE)) |
| **Package license** | `Apache-2.0` ([codex-cli/package.json](../../sources/codex/codex-cli/package.json)) |
| **Rust workspace license** | `license.workspace = true` (Apache-2.0, defined in [codex-rs/Cargo.toml](../../sources/codex/codex-rs/Cargo.toml)) |

## Assessment

- **[F]** Apache-2.0 is permissive: allows use, modification, and distribution with attribution, patent grant, and state-changes notice. No copyleft, no SaaS restriction.
- **[F]** The repository contains third-party vendored/build dependencies (e.g. `third_party/v8`, `third_party/wezterm`, `third_party/wine`, `third_party/powershell`) — these carry their own licenses and are used only as build-time sandbox / terminal / Windows tooling, not linked into RoboThree-relevant agent logic.
- **[I]** The Rust workspace uses `license.workspace = true`, so all `codex-rs/*` crates inherit Apache-2.0 unless a specific crate overrides it.

## Reuse Classification (per SKILL § 14.4)

| Mechanism | Reuse Level | Notes |
|---|---|---|
| Agent turn loop / concurrent tool dispatch design | **DESIGN_ONLY** | 接口模式与状态机可参考；实现与 Responses API 强耦合，不可直接复制 |
| Sandbox / exec-policy approval decision matrix | **DESIGN_ONLY** | `render_decision_for_unmatched_command` 的 allow/prompt/deny 决策表是纯设计思想 |
| Extension registry (contributor trait model) | **DESIGN_ONLY** | 12 种 contributor trait 的切面设计可参考；不与 codex 的 `codex_extension_api` 直接复用 |
| MCP client/server binding | **ATTRIBUTION_REQUIRED** | 若复用 `rmcp-client` 传输层，需保留 Apache-2.0 声明（且 rmcp 本身是第三方库） |

## Caveats

- **[R]** 直接复用任何 `codex-rs/*` 源码片段到 RoboThree 需保留 Apache-2.0 版权声明与 NOTICE；建议只在接口/状态机层面借鉴，不复制实现。
- **[R]** `third_party/v8` 等目录**严禁**进入 RoboThree 产品仓库（违反「不得把第三方镜像源码复制进产品仓库」边界）。
