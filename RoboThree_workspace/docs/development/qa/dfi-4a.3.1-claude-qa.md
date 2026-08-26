# DFI-4A.3.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-0850-version-dfi-4a.3.1` |
| 验收对象 | DFI-4A.3.1：Secure Provider + Invocation/Usage Foundation |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.3.1`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.3.1 Harness（provider/invocation-conformance/sensitive-boundary/keychain/coordinator/command 6 个测试文件） | **PASS 6 files / 48 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 220 files / 1458 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 §3.1/§4/§5 + migration 24）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | OpenAI-compatible HTTPS/SSE Provider | ✅ [local-personal-openai-compatible-model-provider.ts](services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts) 用 `node:https` + SSE decode + 复用 `ModelStreamEventSchema`/`ModelStreamSequenceValidator`（不建第二套 stream 语义） |
| 2 | DNS pinning + TLS + redirect + deadline + limit | ✅ `dns.lookup(all:true)` 取全部地址 + custom `lookup` 只返回 pinned 单地址；`rejectUnauthorized:true`；`request.destroy(deadline_exceeded)`；content-type 校验 `text/event-stream`；response 字节上限 |
| 3 | SSE 负向不变量 | ✅ 跨 chunk CRLF normalize（`normalizeSseNewlines`）、`stream_terminal_duplicate`、`event_after_terminal`、`stream_terminal_missing`、`sse_incomplete_event`、`sse_event_too_large`、`tool_call_limit_exceeded`、`finish_reason_conflict` |
| 4 | migration 24 | ✅ [migrations.ts:1280](services/core/src/adapters/sqlite/migrations.ts#L1280) `dfi_4a3_local_personal_model_invocations`：`invocation_links`（精确锁全 identity：model_lock_id/digest + task_runtime_selection_id/digest + personal_model_id + configuration/execution digest + provider_profile/endpoint/credential_binding digest + status 状态机 + fencing_epoch）+ `usage_facts`（registered/recorded 状态） |
| 5 | Usage 缺失不伪造 0 | ✅ usage_facts 的 `state IN ('registered','recorded')` + CHECK（registered 时 usage_digest/fact_json 为 NULL）；测试断言「does not fabricate Usage when the Provider omits it」 |
| 6 | 原子提交 + typed conflict 回滚 | ✅ InMemory/SQLite 聚合 Persistence；terminal/Usage/Projection/status 原子提交；测试覆盖 conflict 回滚 |
| 7 | status 单调性 | ✅ 测试「maps status observations without treating cancellation/deadline as model health」——cancelled/deadline 映射 undefined（不推进模型健康状态） |
| 8 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；覆盖 profile 冻结 + revision drift、projection 只含锁定字段、Endpoint base 语义、Usage 不伪造、TLS 流式 + private delta 跳过 + Tool/Usage 组装 + 测试 canary（`Bearer sk-test-placeholder-not-real`） |
| 9 | 边界零漂移 | ✅ 本批改动 = `services/core/src/adapters/https` + `adapters/memory` + `adapters/sqlite` + `application` + tests；未进 Task selection/lock、Agent Loop、Main/Preload/Renderer/Central；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.3.1 正确完成 Secure Provider + Invocation/Usage Foundation：Core-private OpenAI-compatible
HTTPS/SSE Provider 复用 `ModelStreamSequenceValidator`（不建第二套 stream 语义）；DeepSeek/智谱/Kimi/
Custom Relay 版本化 profile + revision drift 拒绝；DNS pinning + TLS + redirect + deadline + 字节上限安全
边界；SSE 负向不变量完整（跨 chunk CRLF、terminal 后拒绝、重复/缺失 terminal、tool call 上限）；migration 24
（invocation links 含精确锁全 identity + usage facts 用 registered/recorded 状态表示 Usage 缺失不伪造 0）；
terminal/Usage/Projection/status 原子提交 + typed conflict 回滚 + 状态单调性。四项门禁独立串行复跑全绿
（Harness 6/48、完整 check 220/1458 + 3 smoke、Central online/offline 302/302）。边界零漂移：未进 Task
selection/lock、Agent Loop、Main/Preload/Renderer/Central，`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.3.1 可进入用户接受流程。DFI-4A.3.2/3.3、DFI-4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
