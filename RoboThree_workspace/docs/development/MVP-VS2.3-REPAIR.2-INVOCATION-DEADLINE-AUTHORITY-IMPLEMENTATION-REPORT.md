# MVP-VS2.3 repair.2 — Invocation Deadline Authority 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-30  
> 范围：用户选择的方案 A；internal legacy/V2 Model invocation link deadline authority

## 1. 交付结果

1. internal legacy 与 V2 strict Model invocation link 均 additive 增加可选
   `providerRequestDeadlineAt`，没有修改任何公开 Contract；
2. deadline 自动进入既有 canonical record digest；prepared-link exact comparison 对 legacy/V2 统一执行四态比较；
3. Enterprise Provider 首次 prepare 对两种 internal record 都写入 invocation 使用的 exact deadline；
4. startup recovery 只接受 durable deadline，historical 缺字段仍可读取，但 active recovery 必须 fail-closed；
5. Memory 与 SQLite `record_json` 路径均保持无 migration 的 additive round-trip；
6. round-3 继续固定为 PPTX write Tool 完成后的最终模型轮次。

## 2. 边界

- `packages/contracts/src/**` 零修改；
- migration 继续止 26；
- 零新依赖，零 lockfile 意图变更；
- Gateway wire、Desktop API、Main/Preload production API 零修改；
- 没有新增恢复表、状态机、通用 Lifecycle 或下游能力；
- Personal Model、Admin mutation、TGM、Knowledge Provider、Agent Lifecycle 继续 GATED。

## 3. 开发者验证

- deadline/recovery/provider/coordinator 与 Renderer business projection：`6 files / 73 tests PASS`；
- `pnpm exec tsc -b services/core apps/desktop`：PASS；
- 真实 Electron 已证明 repair.2 目标成立：原 round-2 invocation 一次 accept、同 invocation 两次 SSE subscription，
  新 Core 继续执行并完成 round-3；DOCX read 与 PPTX write 均各执行一次，Assistant Message 与 PPTX Artifact 各一份。

## 4. 父批停手

同一真实 Electron E2E 在最终 PPTX HTML 预览处返回既有安全错误 `task.not_found`。Task 已 completed、round-3=1、
Assistant/Artifact/“读取资料”/“生成成果”均可见，说明该失败发生在完成后的 Artifact source/preview 路径，不是 deadline、
SSE resume 或 Tool 重放问题。

父 VS2.3 明确规定真实 E2E 如需修改 Core/Main/Preload production logic 必须停手。因此 repair.2 可提交独立 QA，
但 VS2.3 父批不得标记完成；后续需对 PPTX 预览来源授权做极小聚焦评审。

## 5. 独立 QA 与用户接受

- Claude Code 独立聚焦代码 QA：`CODE_QA_PASS`；P0=0、P1=0、P2=0、P3=0；
- focused `6 files / 73 tests PASS`，VS2.1/VS2.2 regression `10 files / 67 tests PASS`；
- 用户已正式接受并关闭 repair.2；父 VS2.3 与 PPTX preview blocker 不随本子批自动关闭。
