# DFI-5.3.3 Enterprise OpenAI-compatible / Anthropic-compatible Reasoning Mapping 实施报告

> 日期：2026-08-27  
> 开发版本：Root/Core `0.0.0-dfi.5.3.3`；Contracts package 版本不变  
> 状态：**PASS/CLOSED**  
> 最高输出：`DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT`

## 1. 实施结论

DFI-5.3.3 已把 Task 锁定的 reasoning 决策接入 Enterprise Gateway v1alpha3，并在 Central 内分别映射到
OpenAI-compatible 与 Anthropic-compatible Provider：

```text
ModelRequest v1alpha2
  -> Core exact Profile/mapping preflight
  -> Gateway v1alpha3 safe reasoning sidecar
  -> Central 独立重算三层 digest + Endpoint Binding 校验
  -> sealed OpenAI effort / Anthropic thinking budget
  -> Provider allowlist body
```

`default_passthrough` 继续完全省略 reasoning 参数；`max_applied` 只使用 Task 中已锁定的 exact Profile、Strategy、
mapping 与 timeout identity。当前没有获批的 production Enterprise Max release，production Gateway v1alpha3 route、
production SubmitTurn v1alpha3 与 Desktop Max UI 均保持不可达/0。

独立 QA 已以 8 TS files / 73 tests、6 Java classes / 13 tests、root check 291 files / 2011 tests + 3 smoke、
Central online/offline 437/437 完成复核，P0～P3 全 0，并由用户正式接受。文档复核阶段关于 Gateway Contract
路径的误报澄清保留为历史记录，不作为实现缺陷。

## 2. 关键实现

### 2.1 Additive Gateway v1alpha3

新增 `contracts/enterprise-gateway/v1alpha3/**`：

- v1alpha1/v1alpha2 文件与语义不改；v1alpha3 单独提供 Schema、OpenAPI、fixtures、manifest 与 canonical digest；
- reasoning sidecar 是 strict union：default 只表达 passthrough，max 只携带 content-free safe refs；
- Prompt Cache 为 optional all-or-none，cache 与 reasoning 组合互不覆盖；
- raw `reasoning_effort`、`thinking`、budget、Endpoint/Credential 等 Provider-private material 不进入 Wire Contract。

Canonical digest：

| material | digest |
| --- | --- |
| schema | `0ba2f3e903643a140059960bbaad3272bf35a4df2dbadc60d23f4dd2afa63a21` |
| compatibility | `630505fd8efec461fe0bfd9a30188b431e9590417891fe03d08bb53c1912f8bc` |
| OpenAPI | `958d0a2ca5fee08bf7b474687d7001f01deb83e764f87ab140b6813fea912aa1` |
| manifest | `9394e4b6da2b69e322d31ed789572a0aa3a74ef070a4c555cfbbc7ddc008ddab` |

### 2.2 Core mapping-before-durable-prepare

Core 新增 Enterprise sealed projection，并扩展 converter、durable wrapper 与 Gateway client：

- terminal replay 先于 mapping，replay 时 mapping load 与上游调用均为 0；
- 非 terminal 的 v1alpha2 request 先完成 exact Profile/mapping 校验，再允许 durable Invocation Link prepare；
- v1alpha3 request digest 覆盖 schemaVersion、safe reasoning sidecar 与可选 cache context；
- 未安装 exact mapping 时仍返回 `reasoning_protocol_unavailable`，不得 silent fallback；
- retry、Tool 后续轮、Compaction 与 restart 继续复用原 Task lock 与 migration 25 durable deadline。

### 2.3 Central 第二次独立校验

Central 新增 immutable release/source/registry 与第二验证器：

1. 按 `robothree.provider-reasoning-strategy.v1\n` 重算 Strategy commitment；
2. 按 `robothree.reasoning-profile.v1` 重算 safe Profile；
3. 按 `robothree.provider-reasoning-mapping.v1\n` 重算完整 private mapping；
4. 对齐 Gateway safe refs、provider family、timeout identity 与 exact Endpoint Binding；
5. 任何缺失、重复或 digest drift 均在 Provider accept/request 前失败关闭。

该校验不信任 Core 传来的 digest，也不读取 current/latest alias。

### 2.4 两类 Provider body projector

- OpenAI-compatible 仅允许增加 `reasoning_effort: "high" | "xhigh"`；
- Anthropic-compatible 仅允许增加 `thinking: {"type":"enabled","budget_tokens":N}`，且 budget 必须小于
  `max_tokens`；
- default/fallback body 中 reasoning 相关字段数为 0，不发送 low/minimal/off/boolean 模拟关闭；
- reasoning/thinking/signature 只用于私有协议进度，不进入 assistant text、Message、Receipt、日志或 UI。

### 2.5 三态 activation gate

`robothree.model-gateway.enterprise-reasoning-v1alpha3-enabled` 按三态处理：

- `false`：service/controller/mapping 均为 0；
- `true` 且依赖不完整：HTTP ready 前 fail-fast；
- production profile 下 `true`：当前明确拒绝，因为 production identity/entitlement/release 尚未就绪。

测试 composition 可显式提供完整依赖证明一套 v1alpha3 service/controller，但不冒充 production ready。

## 3. 边界与诚实状态

本批修改 Core、Enterprise Gateway Wire Contract、Central Gateway/Provider Adapter 及对应测试、Harness、证据与治理文档。
未修改 Desktop、Admin、migration 或依赖；`pnpm-lock.yaml` digest 保持
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`，migration 仍止 26。

以下事实继续为 false/0：

- production Gateway v1alpha3 route count；
- production Enterprise OpenAI Max release count；
- production Enterprise Anthropic Max release count；
- production SubmitTurn v1alpha3 reachability；
- Desktop Max UI readiness；
- production CPC activation；
- production enterprise entitlement readiness。

DFI-5.3.1/5.3.2 historical evidence 保持只读；父方案 120 项 QA 仍为
`retained_for_dfi53_stage_closure`，不把本批 focused 门禁冒充为父阶段全部执行。

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.3.3` | PASS，8 TS files / 73 tests + 6 Java classes / 13 tests；evidence `sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826` |
| `pnpm run check` | PASS，291 files / 2011 tests + 3 smoke + Architecture boundary |
| `pnpm run check:central` | PASS，437/0/0/0 |
| `pnpm run check:central:offline` | PASS，437/0/0/0 |
| `pnpm run harness:cpc3` | PASS，CPC System Message/Context Receipt 权限层级零漂移 |
| `pnpm run lint` / `pnpm run audit:dtp4` | PASS |
| `CI=true pnpm install --frozen-lockfile --offline` | PASS |

开发过程中曾误并发启动两轮 root full check，导致 dcf13c、R2D4 与 Document Worker process-canary 出现资源竞争型
失败；三个 focused 测试随后 11/11 通过，最终单实例完整 `check` 一次通过。Central 首次在受限沙箱内运行因
loopback socket `Operation not permitted` 失败，确认是执行环境限制后在允许本机回环端口的环境中复跑通过，未把
环境失败归因到产品代码。

治理文档更新后再次验证 root check 时，受限沙箱内的 Keychain、loopback 与真实子进程测试同样因 EPERM/隔离
Keychain 不可用而失败；在允许这些既有门禁能力的环境中单实例复跑后，291/291 files、2011/2011 tests 与
3 smoke 全部通过。最终报告采用该完整可执行环境的结果，并保留沙箱失败的真实归因。

Root/Core 版本推进后，`audit:dtp4` 首跑准确发现 packaging audit 仍锁定上一批 `0.0.0-dfi.5.3.2`；本批只把
audit 的 Root/Core expected version 与对应测试同步为 `0.0.0-dfi.5.3.3`，focused audit test 2/2 与正式
packaging audit 随后通过，未改变任何打包规则。

## 5. 后续状态

DFI-5.3.3 独立 QA P0～P3 全 0，并已由用户正式接受，当前 `PASS/CLOSED`。DFI-5.3.4 已进入 docs-only
Lifecycle / Cutover / Stage Closure 方案评审，仍 `CODING GATED`；DFI-5.4、TGM、Knowledge Provider、
Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED，本批关闭不自动解锁任何下游。
