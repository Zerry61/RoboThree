# MVP-VS2.3 repair.2 — Legacy Link Authority 实施停手报告

> 状态：**HISTORICAL STOP RESOLVED BY USER-SELECTED SCHEME A**  
> 日期：2026-08-30  
> 范围：VS2.3 repair.2 Invocation Deadline Authority

## 1. 已完成且验证通过

- `ModelInvocationLinkV2Schema` 保持 `.strict()`，additive 增加可选
  `providerRequestDeadlineAt`；
- deadline 已进入 record digest 和 prepared-link exact comparison；比较覆盖两侧都缺、两侧相同、一侧缺失、
  两侧不等四态；
- Enterprise Provider 的 V2 prepare 写入 invocation exact deadline；repair.1 startup recovery seed 读取并复用；
- Memory 与 SQLite `record_json` round-trip 不丢字段，未新增 migration、表、列或索引；
- Core typecheck 与聚焦 `4 files / 48 tests` PASS。

## 2. 真实 Electron E2E 新发现

真实 Electron、真实 Core child、真实 SQLite、round-1 DOCX read 与 round-2 首次 Gateway accept 均成功。SIGKILL
并由新 Core 打开原 SQLite 后，Task 以 `agent_loop.failed` fail-closed；安全错误为：

```text
Model invocation link is unavailable for Assistant Message commit
```

只读检查原 SQLite 证明 round-2 link 是 frozen legacy record：

- `schemaVersion` 不存在；
- `providerRequestDeadlineAt` 不存在；
- `invocationId`、`durableCursor` 与首次 accept 已持久化；
- Task 在 recovery 后转为 `failed`；
- V2 deadline 代码没有机会作用于该真实路径。

根因不是 deadline digest 实现错误，而是 Desktop internal-trial default reasoning 链虽使用
`runtime-selection.v1alpha4`，当前 bootstrap 未安装 `DynamicRequestFactsRuntime`；Provider 只有在 invocation 带
`dynamicContext` 时才构造 V2 link。因此本批“只给 V2 增加 deadline”的假设不覆盖实际消费者。

## 3. 为什么必须停手

继续修复至少需要另选一项超出 repair.2 已评审范围的生产语义：

1. 为 frozen legacy link additive 增加 deadline；或
2. 在 normal Desktop graph 启用 Dynamic Facts，使真实请求切换为 V2 link；或
3. 新增另一种 internal link revision/恢复投影。

方案 1 修改 frozen legacy strict schema；方案 2 会改变 request/context authority 与请求 digest；方案 3 会新增
版本与转换语义。三者都不能作为当前 repair.2 的实施细节擅自选择，也不能用 fixture clock、删除 exact 比较、再次
accept 或新增 production barrier 绕过。

## 4. 当前工作区状态

- repair.2 的 V2 additive 实现和 focused tests 保留，尚未标记完成或关闭；
- repair.1 startup recovery WIP 保留，父 VS2.3 继续 paused；
- 临时诊断数据库已删除，test-only keep-temp 代码已移除；
- Contract、migration、依赖、lockfile、Desktop production API 和下游能力均未修改；
- round-3 仍固定指完成 PPTX write Tool 后的最终模型轮次，但尚未到达并验证。

## 5. 建议回评审的最小决策

建议优先评审“legacy internal link additive deadline”这一最小选项：仅给 frozen legacy internal record 增加可选
deadline、纳入 digest/四态比较，并规定 historical absent 只允许 terminal replay，active recovery 必须
fail-closed。若团队不接受修改 legacy strict schema，则应单独规划 normal graph 的 Dynamic Facts/V2 cutover，不能
把它伪装为 repair.2。

用户重新选择并授权前，不恢复真实 Electron E2E 编码，不标记 repair.2、repair.1 或 VS2.3 `PASS/CLOSED`。

## 6. 用户决策与解决结果

用户选择方案 A 并恢复 repair.2 编码授权。实施结果：

- internal legacy 与 V2 strict schema 均 additive 接受可选 `providerRequestDeadlineAt`；
- 字段进入同一 record digest，并在 prepared-link comparison 中覆盖“两侧都缺、两侧相同、一侧缺失、两侧不等”四态；
- historical 缺字段 record 保持可读取；active startup recovery 缺字段继续 fail-closed；
- Enterprise Provider 首次 prepare 对 legacy/V2 均写入 exact invocation deadline；恢复只读取 durable deadline；
- Memory/SQLite `record_json` round-trip 无字段丢失，未新增 migration、表、列或索引；
- 聚焦验证 `6 files / 73 tests PASS`，Core/Desktop typecheck PASS。

该停手条件已关闭，但不等于父 VS2.3 完成。恢复同一真实 Electron E2E 后，deadline 与 SSE resume 已通过，随后暴露
PPTX 预览来源解析的独立生产缺口；该缺口不属于 repair.2，按父方案边界再次停手。
