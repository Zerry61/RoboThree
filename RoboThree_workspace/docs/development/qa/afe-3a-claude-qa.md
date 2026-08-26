# AFE-3A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1730-version-afe.3a` |
| 验收对象 | AFE-3A：Admin Tool pages foundation |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 |
| 开发版本 | Admin Console 并发批次（无独立版本号，随 AFE 线） |
| 上游 | AFE-2 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm --filter @robothree/admin-console typecheck` | **PASS** |
| 2 | `typecheck:negative` | **PASS**（3 fixture + Type/missingField 非恒真） |
| 3 | `build` | **PASS**，98 modules |
| 4 | `test` | **PASS 7 files / 33 tests** |
| 5 | `scan:static` | **PASS**，sourceViolations 0 + 正向检出 9 + 反向 0 误报 |
| 6 | `scan:deps` / `why vue` | **PASS**，admin 2.7.16 only / desktop 3.5.40 only |
| 7 | `smoke:dev` | **PASS** |
| 8 | `apps/desktop/tests` | **PASS 58 files / 235 tests** |
| 9 | `apps/desktop build` | **PASS**（复跑时已绿——DFI-5.2.2 并行窗口修复了 AFE-3A 报告时的 Stats\|BigIntStats 错误） |

### workspace 级外部阻塞（非 AFE-3A 缺陷）

`CI=true pnpm run check` 当前被 **DFI-5.2.2 并行编码窗口的 lint 错误**卡住：
- `services/core/src/application/submit-turn-coordinator.ts:38,40` — `SubmitTurnRecordV1Alpha3`/`TaskRuntimeSelectionV1Alpha2` defined but never used
- `services/core/tests/submit-turn-coordinator.integration.test.ts:193` — `exactProfile` prefer-const

这些文件全部在 `services/core/`（DFI-5.2.2 并行窗口 mtime 17:22~17:36 写入的 `reasoning-mode-lock-planner.ts`/`submit-turn-coordinator.ts`/`sqlite-task-persistence.ts` 等），**不在 AFE-3A 授权范围 `apps/admin-console/**`**。AFE-3A 报告里的「未全绿项」（desktop-ipc-router Stats|BigIntStats、sqlite-task-persistence）正是这个并行窗口的中间状态，现已部分收敛（desktop build 恢复），但 DFI-5.2.2 自身仍有新的 lint 错误未清。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 范围边界 | ✅ 12 文件全在 `apps/admin-console/**`（router + 5 Tool 页面 + 2 组件 + presentation + fixture + types + base.css）；非 admin-console 的改动（Core/Desktop）均为 DFI-5.2.2 并行窗口 |
| 2 | Tool 六列聚合列表 | ✅ ToolsPage 三来源展示 + 四组状态（配置/验证/健康/生效）；操作 disabled |
| 3 | 新增 Tool 边界 | ✅ 主操作只有「连接 API」「连接 MCP」；无代码 Tool 新增入口 |
| 4 | HTTP API 两步壳 | ✅ ToolApiCreatePage：基础配置 + 连接配置两步；cURL 演示只产生本地表单状态不产生成功 |
| 5 | MCP 三步壳 | ✅ ToolMcpCreatePage：验证并发现/选择 Tool/设置范围；真实验证 disabled |
| 6 | 策略壳 | ✅ ToolPolicyPage 操作 disabled |
| 7 | 敏感字段禁入 | ✅ [tool-pages.admin.ts](apps/admin-console/tests/component/tool-pages.admin.ts) `forbiddenBusinessSuccessText`（创建/保存/发布/安装/测试/同步成功）+ `forbiddenSensitiveText`（API Key/Credential Reference/Endpoint/Token/Bearer/CapabilityLock）逐页断言 `not.toContain`；detail 断言 `button:disabled` 数量 |
| 8 | Prototype/GATED 标识 | ✅ PrototypeGateNotice 组件 + 页面文案「真实配置能力待接入」 |

---

## 三、发现

### AFE-3A 本批：P0 = 0，P1 = 0，P2 = 0，P3 = 0

### 外部阻塞（非 AFE-3A 缺陷）：workspace 完整 check 被 DFI-5.2.2 并行窗口 lint 错误卡住

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（附 workspace 级外部阻塞）
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

AFE-3A 正确完成 Admin Tool pages foundation：Tool 六列聚合列表、详情、HTTP API 两步壳、MCP 三步壳、策略壳
全为 Prototype/GATED（新增入口只有连接 API/连接 MCP，代码 Tool 无新增入口）；敏感字段禁入测试完整
（创建/保存/发布/安装/测试/同步成功 + API Key/Credential Reference/Endpoint/Token/Bearer/CapabilityLock 逐页
断言）；PrototypeGateNotice/TechnicalDetailsDisclosure 组件 + fixture/presentation/types 落地。范围严格限定
`apps/admin-console/**`，未越界。门禁独立复跑全绿（admin-console 全 7 项 + Desktop tests 58/235 + Desktop
build）。**但 workspace 完整 `pnpm run check` 被 DFI-5.2.2 并行编码窗口的 lint 错误阻塞**（全在
`services/core/`，非 AFE-3A 范围），需该窗口收敛后才能全绿。

**AFE-3A 本批可进入用户接受流程；但 workspace 级完整门禁需先由 DFI-5.2.2 窗口清除其 lint 错误，建议在其
收敛后复跑 root check 作为 AFE-3A 收口确认。AFE-3B（Robot pages）、AFE-3C（Skill pages）、AFE-4~AFE-6、
AAPI-0.3~0.4、TGM、Knowledge Provider 继续 GATED。**

— Claude Code（独立 QA，只读）

---

## 附：最终收口复核（2026-08-25，绿色 baseline）

上次 QA 记录的外部阻塞（DFI-5.2.2 并行窗口 lint 错误）已由 DFI-5.2.2 收口清除。最终复核：

| 门禁 | 结果 |
|---|---|
| 完整 `pnpm run check` | **PASS 255 files / 1710 tests + 3 smoke + Architecture boundary**（全绿，无外部阻塞） |
| admin-console typecheck / build / test | **PASS**（build 98 modules、test 7 files / 33 tests） |
| admin-console 版本 | `0.0.0-afe.3a`（版本收口完成） |
| 边界 | lockfile 仍 `c47641ac…` 未变；未改 Desktop/Core/Central/Contracts/Main/Preload/IPC/migration/root deps |

**最终结论不变：PASS（P0=0/P1=0/P2=0/P3=0）。** AFE-3A 基于绿色 baseline 确认可进入用户接受流程；接受后
关闭 AFE-3A。AFE-3B（Robot pages）、AFE-3C（Skill pages）、AAPI-0.3~0.4、AdminAdapter/AFE consumption、TGM、
Knowledge Provider、production identity 继续 GATED。

— Claude Code（独立 QA，只读）
