# License Review

> 许可证识别方法、多 License 仓库处理、子模块 / 三方代码 / 生成代码 / 依赖库 / SaaS / Copyleft / Patent / Trademark / RoboThree 复用分级。

---

## 1. 许可证识别流程

1. **根 LICENSE / LICENSE.md / LICENSE.txt**：记录 SPDX。
2. **每个子目录独立 LICENSE**：Monorepo / vendored code / sub-package。
3. **每个 Git submodule**：`git submodule status` + 进到子目录看 LICENSE。
4. **每个 Vendor / Third-party 目录**：`THIRD_PARTY_NOTICES`、`ATTRIBUTION`。
5. **生成代码目录**：`build/`、`dist/`、`generated/`、`*.pb.go` 通常不携带许可证，但底层使用的工具 / schema 仍受约束。
6. **依赖**：用工具扫描（npm `license-checker`、Go `go-licenses`、Python `pip-licenses`、Rust `cargo-license`）。
7. **数据集 / 模型权重**：单独 LICENSE（如 Llama、OpenRAIL）。
8. **Doc / Comment**：通常文档可借鉴，但代码片段必须看 LICENSE。

输出到 `research/<project>/license-review.md`。

---

## 2. 多 License 情况

常见模式：

- **主仓库 MIT + 第三方代码 MIT/Apache-2.0**：可用，但需 attribution。
- **主仓库 Apache-2.0 + 部分代码 GPL-3.0**：传染全仓，极少见。
- **主仓库 BUSL / SSPL**：禁止 SaaS 提供，需法律复核。
- **主仓库 MIT + vendored library 是 MIT + 第三方 model 是非商业**：必须分别处理。

**结论**：不得仅看根 LICENSE 判断全仓库。必须逐目录识别。

---

## 3. 子模块与 Vendor 代码

- **Git submodule**：跟随其原仓库 LICENSE。
- **Vendor 目录**：单独 LICENSE 文件（如 `vendor/<lib>/LICENSE`）。
- **生成代码**：不直接继承上游 LICENSE（但生成工具的许可证可能影响其用途）。

---

## 4. 依赖库许可证传染性

| 协议 | 静态链接 | 动态链接 | SaaS 提供 |
| --- | --- | --- | --- |
| MIT | ✅ | ✅ | ✅ |
| BSD-2/3-Clause | ✅ | ✅ | ✅ |
| Apache-2.0 | ✅ | ✅ | ✅（注明 NOTICE） |
| LGPL | 限制（动态更安全） | ✅ | 视情况 |
| GPL-2/3 | ❌ 传染 | ❌ 传染 | ❌（AGPL 变种管 SaaS） |
| AGPL-3.0 | ❌ 传染 SaaS | ❌ 传染 SaaS | ❌ |
| MPL-2.0 | 视修改范围 | ✅ | ✅ |
| BUSL-1.1 | 限制商用 | 限制商用 | 限制商用 |
| SSPL-1.0 | ❌ SaaS | ❌ SaaS | ❌ |
| Elastic License v2 | 限制 | 限制 | 限制 |
| OpenRAIL | 限制 | 限制 | 限制 |
| Llama Community License | 限制月活 | 限制月活 | 限制月活 |

---

## 5. 学术 / 论文代码

- 通常 MIT / Apache-2.0。
- 部分论文附带 "research-only" 限制。
- 部分研究代码使用 CC-BY-NC / CC-BY-NC-SA；不可商用。

---

## 6. Trademark / Patent 条款

- **Apache-2.0** 含显式 patent grant。
- **MIT / BSD** 不含显式 patent；风险较高。
- **License 包含 "no trademark"**：禁止使用项目商标。

---

## 7. RoboThree 复用分级

| 等级 | 条件 | 行动 |
| --- | --- | --- |
| **DIRECT_REUSE** | MIT / BSD / Apache-2.0 且无 CLA 限制 | 可直接复用片段 |
| **ATTRIBUTION_REQUIRED** | Apache-2.0、MPL-2.0、BSD | 复用并保留 NOTICE 与版权 |
| **DESIGN_ONLY** | AGPL / GPL 核心代码 | 仅借鉴设计思想与接口 |
| **LEGAL_REVIEW_REQUIRED** | BUSL / SSPL / Elastic / Llama / OpenRAIL | 法务复核 |
| **NOT_RECOMMENDED** | CC-BY-NC / No-Commercial / 学术限制 | 不复用 |
| **ORIGINAL_ONLY** | 项目私有 / 商业限制 | 只在原项目内使用 |
| **LICENSE_RISK** | 多协议混合、NOTICE 不全 | 律师复核 |
| **SECURITY_RISK** | 非技术原因，但和安全挂钩 | 提升至 SEC-level 审计 |

---

## 8. 标准产物

`research/<project>/license-review.md` 必含：

1. Repository / Commit / 每个 LICENSE 文件路径 / SPDX。
2. 多 License 情况说明。
3. 子模块 / Vendor / 生成代码 License。
4. 依赖库许可证摘要（按许可协议统计数量）。
5. 商业 / SaaS / 网络 Copyleft 风险。
6. Patent / Trademark 说明。
7. RoboThree 复用分级表（针对每个候选借鉴代码）。
8. NOTICE / Attribution 要求。
9. NEEDS_MORE_EVIDENCE（证据不足项）。

---

## 9. 常见反模式

- "Apache-2.0" 当成 "可商用" 就完事——忽略 NOTICE 与 patent 条款。
- 把 vendor 目录当成项目自有代码。
- 把生成代码计入 license 决策。
- 忽略模型 / 数据集 / 子模块独立许可证。
- 忽略 license 变更历史（issue / PR）。

---

## 10. RoboThree 决策标准

针对每一类借鉴：

- **架构思想**：永远 OK。
- **接口模式**：永远 OK。
- **代码片段 ≤ 20 行 + 注明来源**：通常 OK（ATTRIBUTION_REQUIRED）。
- **代码片段 > 20 行 + 重新实现**：OK（DESIGN_ONLY）。
- **整段搬运**：必须 LEGACY_REVIEW + LICENSE_REUSE ok。
- **直接 fork**：法律复核。
