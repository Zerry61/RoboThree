# APV-0 — Claude Code 只读复核报告（文档批次）

## 基本信息

| 属性 | 内容 |
| --- | --- |
| 验收对象 | APV-0：Artifact Preview Product / Security / Engineering Freeze（纯文档批次） |
| 日期 | 2026-08-05 |
| 复核者 | Claude Code（独立只读复核） |
| 触发方式 | 用户显式指令（"已完成 APV-0 文档冻结，交 Claude Code 只读复核"） |
| 批次性质 | 仅文档：`docs/development/apv/APV-ARTIFACT-PREVIEW-DEVELOPMENT-PLAN.md` 新增；README / CHANGELOG / DEVELOPMENT-LOG 更新 |
| 版本 | 未变：Root `0.0.0-dtp.4` / Core `0.0.0-dwe.3` / Desktop `0.0.0-dtp.4` / Document Worker `0.0.0-dwe.2` / Contracts `0.0.0-cgf.2c.1` |

> 说明：本批次只改文档，无生产代码、测试、依赖、lockfile、打包或 TypeScript 根配置变更，因此按只读文档复核处理，不跑 build/test/lint（无对象可跑）。

---

## 一、冻结结论核查（通过）

| 冻结结论 | 独立核查结果 |
| --- | --- |
| APV 是 Desktop/Application capability，不是 Tool | ✅ 计划 §1/§2/§7/§11 明确，且与 DWE-0 §20 APV 边界一致 |
| 不注册 `artifact.preview` Tool ID / model-visible schema | ✅ 生产代码静态扫描无 `artifact.preview` 注册；唯一 grep 命中为 `packages/contracts/src/model-protocol/request.ts` 的 `artifact.previewBytes` **属性名**（LLM 消息内容既有校验，2026-07-23 文件，非 APV 批次改动） |
| 计划拆分 APV-1.0/1A/1B/1C + APV-2 | ✅ 按「产品 UI / 渲染安全 / preview server 生命周期」解耦，路线合理 |
| 无生产代码变更 | ✅ APV-0 窗口（08-05 15:00 后）services/apps/packages/scripts 零非文档文件改动 |
| 无公共 Contracts 变更 | ✅ `packages/contracts/**` 零改动 |
| 无依赖 / lockfile / 根 package / 根 tsconfig 变更 | ✅ `pnpm-lock.yaml`（08-04 13:19）、根 `package.json`（08-04 18:06）、根 `tsconfig.json`（08-04 13:14）均未动 |
| 版本保持不变 | ✅ 五仓版本全部与原值一致 |
| APV-1 / APV-2 / overwrite / OS Sandbox / 正式安装包保持 GATED | ✅ 计划 §1/§12 明确 |

## 二、文档一致性核查（通过）

- CHANGELOG：APV-0 条目存在，描述与计划一致（"Desktop/Application 能力，不是 artifact.preview 或任何 model-visible Tool"）。
- DEVELOPMENT-LOG：`## APV-0` 条目完整（状态、范围、冻结内容、修改清单、自测/核查命令）。
- README：当前状态段反映 `APV-0 IMPLEMENTED / DOCUMENT REVIEW PENDING`。

## 三、独立评审意见（非阻塞）

| # | 等级 | 观察 | 建议 |
| --- | --- | --- | --- |
| O-1 | P3 | §4 "Required identity" 列 `artifactId/taskId/sourceKind/sourceId/sourceDigest/createdAt`，而 §5 `ArtifactIndexEntry` schema 额外含 `sessionId` | 建议在 APV-1.0 明确 `sessionId` 为投影/展示上下文而非 artifact 身份组成，避免身份定义混淆 |
| O-2 | P3 | §2/§9 对 `packages/contracts/**` 的措辞为"除非先报告硬阻塞否则禁止"，建议 APV-1.0 编码前把"硬阻塞"判据（具体到 IPC 边界）写清 | 便于执行时判定，避免口头标准 |

其余（authority 复用、leakage 清单、Markdown 消毒 allow-list、HTML 沙箱 127.0.0.1-only + CSP deny-by-default + 无 OS sandbox 声称、typed error 复用 `timed_out` 而非 `deadline_exceeded`、与 DWE 边界一致）评审通过，无异议。

---

## 四、总体结论

```text
结论：PASS（文档复核，P0 = 0 / P1 = 0 / P2 = 0 / P3 = 2 观察项）
```

- APV-0 冻结结论与既有 DWE/产品边界一致；静态扫描确认生产代码无 `artifact.preview` 注册、无任何代码/依赖/配置越界；文档（计划 + CHANGELOG + DEVELOPMENT-LOG + README）相互一致。
- 2 项 P3 观察不影响冻结，可随 APV-1.0 编码前文档修订一并处理。

## 五、建议的下一步

1. 用户接受 APV-0 复核结论后正式关闭 APV-0。
2. 单独授权 APV-1.0（Artifact Projection Foundation，Application-private，无渲染/无文件打开）。
3. APV-1A/1B/1C、APV-2、overwrite、OS Sandbox、正式安装包保持 GATED。

— Claude Code（独立只读复核，未修改任何生产代码或文档）
