# CTX-MVP-1 Model-Aware Long Context / Compaction Implementation Report

## 1. 状态

```text
PASS/CLOSED / INDEPENDENT CODE QA PASS / USER ACCEPTED
最高允许结论：CTX_MVP1_MODEL_AWARE_LONG_CONTEXT_CONFORMANT
后续联合门禁：REAL_PROVIDER_CALIBRATION_PENDING / WTE1_LONG_CONTEXT_JOINT_E2E_PENDING
```

本批实现 WTE-1 所需的 model-aware input/output admission 与现有 durable compaction 产品化前置，不实现
`tool.workspace.file.read_text`、连续编辑 UI、长期 Memory、Knowledge 或新的 compaction schema。

## 2. 实施结果

### 2.1 Exact Model capability

- `contextWindowTokens`、`maxOutputTokens` 与 `capabilityProfileRevision` 形成 Core-private exact profile；
- profile ref 同时进入既有 Model adapter descriptor 与 binding，二者不一致、profile digest 漂移或公开
  context 不一致时 fail-closed；
- Admin-managed internal-trial discovery 通过 Main 私有启动链传递 context/output facts，Renderer/Preload API
  未新增字段；
- 历史 Task 缺 profile 时只按锁定 context + 1024 max output 重建，不读取新默认模型改写历史事实。

### 2.2 Task/material-aware output

- 普通 round 的 desired output 为 8192，但按 locked Model max output 向下收敛；4K output/128K context Model
  可继续执行普通任务；
- WTE replacement resolver 对完整 canonical `tool.workspace.file.write_text` envelope 估算，包括 path、prior
  digest、JSON escaping、wrapper 与正文，再增加 25%/至少 1024 tokens 的增长 headroom；
- required output 超出 locked max output 时，在 ModelProvider 调用前抛出
  `workspace.file.output_capacity_insufficient`，Task 落为不可重试 validation failure；不生成、不执行截断 Tool Call。

### 2.3 Per-Task Context policy

- 每轮从 exact Model lock 重建 context/output policy；
- safety margin 为 context 的 2%，并限制在 512～16384 tokens；
- minimum headroom 按 output、context 比例与 32768 上限动态计算；compaction threshold 取 80% ratio 与
  headroom threshold 的较小值；
- ContextPipeline receipt 新增实际 `modelContextWindow/reservedOutputTokens`，ModelRequest.maxOutputTokens 使用
  本轮 exact reserve；
- Instruction Bundle 的 available input/policy digest 同步使用同一 policy，restart 后可确定性重建。

### 2.4 Material identity 与 exact current read

- durable Assistant Tool Call 的 `toolCallId/capabilityId/taskId/actionId` 是 Tool Result material policy 的唯一
  authority；
- 当前 user turn 内的 `tool.workspace.file.read_text` 结果保持 exact/no truncation；历史结果和其他 Tool Result
  继续 bounded reference；
- missing/duplicate Tool identity、Task/Action drift 均 fail-closed，不读取 result 字段名猜测能力。

### 2.5 Estimator 与 compaction

- normal production runtime 与 compaction summarizer 共用 dependency-free `CalibratedTokenEstimator`；Fake estimator
  仅由显式 historical tests 注入；
- estimator 暴露 revision、20% relative + 32 absolute error envelope，不宣称所有 Provider 请求逐次
  `estimate >= actual`；
- 现有 durable first/rolling compaction、pending recovery、source digest 与 status-first recovery 保持不变；
- 50-round、50 Tool-batch 与 Core/SQLite recovery 回归通过，所以 Continuation Capsule v2 未启用。

## 3. 验证

- CTX exact capability/output/material/context + deployment/compaction：`7 files / 49 tests PASS`；
- CTX/context/deployment 快速集：`4 files / 31 tests PASS`；
- Desktop Core supervisor：`1 file / 5 tests PASS`；
- Central Admin discovery：`2 tests / BUILD SUCCESS`；
- Core/Desktop typecheck、focused ESLint、root build、DTP-4 audit、audit self-test、Core smoke 与
  `git diff --check`：PASS。

## 4. 不变边界与待后续联合验证

- 公共 Contract、Core migration 26、Central schema v13、依赖与 lockfile 不变；
- 未新增 IPC、Preload、Renderer 或 Admin 配置 UI；
- 未实现 WTE reader/output material resolver 的产品接线；该 resolver seam 已冻结，随 WTE-1 实现接入；
- 未使用真实公网 400K Provider 凭据跑 usage calibration；64/128KiB read→replace 产品 E2E 也属于 WTE-1 联合
  验证。上述两项完成前不得声明 WTE ready 或 production ready。
