# STRM-2.3 S1～S8 Process Harness 与阶段收口实施报告

> 日期：2026-08-23  
> 版本：`0.0.0-strm.2.3`  
> 状态：**PASS/CLOSED — repair.1 INDEPENDENT QA PASS / USER ACCEPTED**

> 独立 QA 首轮发现的资源证据 P2 与 late cleanup P3 已由
> [STRM-2.3 repair.1](./STRM-2.3-REPAIR.1-RESOURCE-EVIDENCE-REPORT.md) 修复；当前以 repair.1 证据为准。

## 1. 交付结论

STRM-2.3 已用真实 Electron Main、sandboxed Preload、真实 `CorePrivateSupervisor`、真实 Core child
JSON lifecycle 与 fd4/fd5 binary Broker 通道完成 S1～S8 命名窗口验证。

本批唯一输出：

```text
STRM2_PRODUCTION_WIRING_CONFORMANT
```

它只证明 sensitive transport wiring 在受控进程拓扑、崩溃窗口、泄漏扫描和资源回收方面符合冻结方案，
不证明个人模型 CRUD/reveal 产品能力已经 production ready。以下六项仍固定为 `false`：

- `productionFeatureEnabled`；
- `productionSensitiveTransportReady`；
- `productionBusinessHandlerReady`；
- `transportBlockerClosed`；
- `rendererBusinessApiExposed`；
- `zeroCopyClaimed`。

## 2. 实现

### 2.1 两项 P3 最小收口

- private transport additive 增加精确 typed code
  `personal_credential_transport_rejected`，Broker `rejected` 不再映射为语义模糊的 `unavailable`；
- STRM-1 遗留 `sendMutation` / `consumeReveal` 标记为 `@deprecated`；production 依赖图和测试固定只使用
  Main-issued authorization 路径；
- real sandboxed Preload 证明 `SharedArrayBuffer` 全局可能不存在，因此 envelope/receiver 的检查改为先验证
  global 是否存在，再做类型拒绝；该兼容修正不放宽 strict binary envelope。

### 2.2 真实进程 Harness

- Parent 以异步子进程启动真实 Electron，不以内嵌 unit test 冒充进程拓扑；
- Electron Main 启动真实 `CorePrivateSupervisor`，Core child 保持 fd3 JSON lifecycle 与 fd4/fd5 binary
  Broker；
- Preload 使用真实 sandboxed、`contextIsolation=true`、`nodeIntegration=false` 运行边界；
- SIGKILL、Core restart、navigation、reload、renderer crash、Main close 与 profile drift 均由 exact barrier
  之后的确定动作触发；未使用 sleep 猜测、轮询猜测或自动重试；
- S8 reload 使用请求序号守卫，第二个旧会话请求必须被拒绝，不能与原 reload completion 竞争；
- 失败时以同一 safe scanner 写入 `artifacts/strm2.3/failure.json`；成功后清除失败证据。

### 2.3 Evidence 与单一事实源

- 三轮固定 semantic seed，每轮 19 个 fresh process scenario，共 57 次；
- semantic seed 只包含窗口、方向、动作和业务分类，排除 PID、端口、墙钟、临时路径和 transport nonce；
- mutation transport 终态只能声明 `business_reconciliation_required`，durable Receipt 仍是业务结果权威；
- reveal 崩溃或 delivery 不确定一律 `reveal_uncertain_no_replay`，不生成用户已查看 Secret 的虚假事实；
- 四通道分别扫描 parent stdout、child stderr、machine evidence、safe trace；
- 五类 marker 分别按 raw、Base64、percent-encoded、hex 四种形态做 80 次负向注入，scanner 必须逐次失败；
- 14 类资源由真实诊断快照与进程句柄收敛证明归零，不由最终 JSON 固定填充绕过。

## 3. 正式 Harness 证据

`CI=true pnpm run harness:strm2.3`：

- focused：3 files / 14 tests；
- STRM-2.2 regression：通过；
- semantic replay：3 rounds × 19 scenarios = 57；
- named windows：S1～S8；
- semantic digest：`sha256:568dc46976c11b870a031020d50919024f25f977ffabe5fe4b7c8002e5b107ef`；
- mutation dispatch：6；reveal dispatch：12；
- durable reconciliation required：6；reveal no replay：9；
- 四通道敏感命中：0；scanner 负向注入检出：80；
- 14 类资源最终全部为 0；
- 最终 outcome：`STRM2_PRODUCTION_WIRING_CONFORMANT`。

## 4. 开发者门禁

全部严格串行执行，环境为 Node 24.13.0、JDK 21 与 Docker：

| 门禁 | 结果 |
| --- | --- |
| `harness:strm2.3` | PASS：3 files / 14 tests；57 fresh process scenarios；三轮 digest 一致 |
| `check` | PASS：239 files / 1586 tests + 3 smoke |
| Central online | PASS：307/0/0/0 / BUILD SUCCESS |
| Central offline | PASS：307/0/0/0 / BUILD SUCCESS |

## 5. 边界

- Root、Contracts、Desktop 版本为 `0.0.0-strm.2.3`；Core 保持 `0.0.0-eipc.0`；
- production Main/Preload entry 仍 `foundationEnabled=false`；
- 未接个人模型 CRUD/reveal UI、Renderer 业务 API、production business handler 或身份 composition；
- 未新增 migration 25，未改 migration 1～24；
- 未修改 Central、Document Worker、第三方依赖或 `pnpm-lock.yaml`；
- structured-clone 内部副本不可枚举、不可可靠清零的已接受残余风险保持原解释，不宣称 zero-copy。

## 6. 当前门禁

- repair.1 独立 QA 已 PASS 并由用户正式接受；repair.1、STRM-2.3、STRM-2 已依次 `PASS/CLOSED`；
- transport blocker 仍打开，不输出 `SENSITIVE_TRANSPORT_READY`；
- STRM-3、EIPC-1～EIPC-3、DFI-4A.4.1～DFI-4A.4.3、DFI-2B、DFI-3、TGM 继续 `GATED`。
