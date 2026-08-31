# DFI-5.3.1 Private Mapping Digest Ordering 聚焦修订

> 状态：**FOCUSED DIFFERENCE REVIEW PASS/CLOSED / CODING AUTHORIZED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 上游：DFI-5.3 计划评审 `PASS/CLOSED`；DFI-5.3.1 已获用户编码授权，但因本文件所述停手条件暂停  
> 本轮边界：**DOCUMENT REVISION ONLY；不编码、不改公共 Contract、migration、依赖或 lockfile**

## 0. 修订目的

DFI-5.3 原方案 §2.2 要求 `strategyDigest` 同时承诺 Provider-private raw mapping 与
`profileRevision`。现有 `ReasoningProfile` 又把 `strategyDigest` 纳入 Profile material，并由该 material 计算
`profileRevision/profileDigest`。直接照原公式编码会形成循环：

```text
strategyDigest
  -> ReasoningProfile material
  -> profileRevision/profileDigest
  -> strategyDigest material
```

该循环命中 DFI-5.3 §13 停手条件“无法让 Strategy digest 承诺 exact private mapping”。本修订只关闭摘要计算
顺序和 exact 校验责任，不改变已冻结的产品语义、公开 Contract 或 DFI-5.3.1 功能范围。

## 1. 已确认代码事实

1. `ReasoningProfile.profileRevision === profileDigest` 是现有 strict Contract 约束；
2. `createReasoningProfile()` 从包含 `maxStrategy.strategyDigest` 的完整 Profile material 计算 revision/digest；
3. `validateReasoningProfile()` 会按同一路径重算，不能用预填 revision 绕过；
4. Task lock、Runtime Selection 与 ModelRequest 只应携带 safe Profile/Strategy refs，不能携带 raw directive；
5. 本轮开始前无 DFI-5.3.1 生产实现、无 migration 27，lockfile 基线为
   `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

## 2. Revision 1：非循环双摘要顺序

### 2.1 第一层：Strategy Commitment

先构造不依赖派生 Profile revision 的私有 canonical material：

```text
ProviderReasoningStrategyCommitmentMaterialV1
  domain = "robothree.provider-reasoning-strategy.v1\n"
  authority
  providerFamily
  exactSubject
  profileId
  strategyId
  strategyRevision
  timeoutPolicyIdentity
  requestProjectionRevision
  evidenceRevision
  typedPrivateDirective
```

冻结规则：

1. material **不得包含** `profileRevision`、`profileDigest`、`strategyDigest`、`mappingRevision` 或
   `mappingDigest`；
2. `strategyRevision` 是 release-pinned、code/configuration-owned 的 immutable revision，不从本 material
   递归派生；raw directive 变化必须发布新的 `strategyRevision`；
3. `strategyDigest = sha256CanonicalJson(material)`，使用上述独立 domain；
4. `typedPrivateDirective` 仍是 sealed/discriminated private type，禁止任意 JSON Patch、字段名或任意值注入；
5. 公共面只获得 `strategyId/strategyRevision/strategyDigest/timeoutPolicyRef`，不得获得 material 或 raw 值。

### 2.2 第二层：Safe Reasoning Profile

使用第一层得到的 exact `strategyDigest` 构造现有 safe `ReasoningProfile`：

```text
strategyDigest
  -> ReasoningMaxStrategy
  -> createReasoningProfile(existing safe material)
  -> profileRevision == profileDigest
```

必须复用现有 Profile 创建与验证函数，不增加另一套 Profile digest，不预填 revision，不放宽
`profileRevision === profileDigest`，也不修改公共 Contract。

### 2.3 第三层：Full Private Mapping Record

Profile revision 产生后，构造完整私有映射 material：

```text
ProviderReasoningMappingMaterialV1
  domain = "robothree.provider-reasoning-mapping.v1\n"
  mappingId
  authority
  providerFamily
  exactSubject
  exact profileRef = profileId/profileRevision/profileDigest
  exact strategyRef = strategyId/strategyRevision/strategyDigest/timeoutPolicyRef
  timeoutPolicyIdentity
  requestProjectionRevision
  evidenceRevision
  typedPrivateDirective
```

先对该 material 计算 `mappingDigest`，再生成 immutable record：

```text
mappingRevision = mappingDigest
mappingDigest = sha256CanonicalJson(material)
```

`mappingRevision/mappingDigest` 不属于自己的 digest material，因此不产生第二个循环。它们只存在于
Provider-private registry/evidence，不进入公共 Contract、Task lock、Task Receipt、日志或 UI。

## 3. Exact 校验责任

### 3.1 发布/装配时

单一 publisher/factory 必须按以下顺序执行，禁止调用方自由组合：

1. strict parse private Strategy commitment input；
2. 计算 `strategyDigest`；
3. 用该 digest 创建并验证 safe `ReasoningProfile`；
4. 用 exact Profile/Strategy refs 创建 full private mapping material；
5. 计算 `mappingRevision/mappingDigest`；
6. 原子发布 safe Profile 与对应 immutable private mapping，或两者都不发布；
7. 重载后重新计算两层 digest，并验证 exact 配对。

若现有持久化/发布能力无法证明原子配对，DFI-5.3.1 必须停止并回评审，不得用 current alias、内存补齐或
test fixture 冒充 production source。

### 3.2 Task-locked mapping preflight

`default_passthrough` 与两类 fallback 继续 Profile/mapping load=0。`locked_max_strategy` 只允许：

1. 从 Task lock 读取 exact Profile/Strategy refs；
2. 按 authority/providerFamily/exactSubject/profileRef/strategyRef/adapter identity 恰好一次读取 private mapping；
3. 重算 Strategy commitment digest并与 Task lock `strategyDigest` 比较；
4. 重算 full `mappingDigest` 并与 immutable record 比较；
5. 验证 safe Profile revision/digest、Strategy ref、timeout 与 mapping record 全部 exact；
6. 通过后才返回 typed private directive。

缺失/重复使用 `reasoning_mapping_unavailable`；material、digest、subject、adapter、authority 或 timeout 冲突使用
`reasoning_mapping_conflict`。两类错误都必须发生在 Credential resolve、DNS、socket、TLS、HTTP body、Gateway
accept、durable invocation prepare 与 Usage projection 前，八类计数全 0。

### 3.3 历史语义

1. 历史 Task 只按锁定的 exact Profile/Strategy refs 解析，不读取 current pointer；
2. 发布新 raw directive 必须产生新 Strategy revision/digest、Profile revision/digest 和 mapping revision/digest；
3. 历史 mapping 被删除或不可验证时返回 typed unavailable/conflict，不切换到当前 mapping；
4. 重试、Tool 后续轮、Compaction 与 restart 复用原 Task lock 和 durable deadline；
5. terminal replay 不读取 Profile/mapping，不产生上游请求。

## 4. 安全与边界不变

- 不修改 `packages/contracts/src/**`、公共 exports 或既有 Reasoning Profile schema；
- 不新增 migration 27，不修改 migration 1～26；
- 不新增依赖，不修改 `pnpm-lock.yaml`；
- 不接真实 Provider Adapter，不注册 Gateway v1alpha3；
- 不修改 Desktop、Admin、Main、Preload、IPC、Central production Gateway；
- production SubmitTurn v1alpha3 与 Desktop Max UI 继续不可达；
- raw directive、mapping material/digest 不进入 Task Receipt、日志、错误摘要、UI 或 cross-language public fixture；
- DFI-5.3.2～5.3.4、DFI-5.4、TGM、Knowledge Provider 继续 GATED。

## 5. DFI-5.3.1 聚焦测试增量

编码恢复后，除父方案既有门禁外至少增加以下 24 项：

以下 24 项与父方案 §9 的 120 项均须保留独立验收证据；即使功能相近也不得择一删除。底层 fixture 可以复用，
但 DFI-5.3.1 focused harness 与父矩阵必须分别保留对应 assertion 和可追溯结果。

1. Strategy material 不含任何派生 digest/revision；
2. 相同输入 100 次得到唯一 `strategyDigest`；
3. raw directive 单字节变化改变 Strategy digest；
4. raw directive变化但 Strategy revision 未变化时发布失败；
5. Profile 创建使用计算后的 exact Strategy digest；
6. Profile revision/digest 由既有 helper 产生且相等；
7. Profile validator 重算通过；
8. full mapping material包含 exact Profile revision/digest；
9. full mapping material包含 exact Strategy revision/digest；
10. mapping material 不含自身 revision/digest；
11. 相同输入得到唯一 mapping digest；
12. mapping revision精确等于 mapping digest；
13. Profile safe material变化会改变 Profile 与 mapping digest；
14. private raw material变化会改变 Strategy、Profile 与 mapping digest；
15. Strategy/Profile/mapping 三层任一 byte flip 均失败关闭；
16. exact mapping缺失返回 typed unavailable；
17. exact mapping重复返回 typed conflict；
18. current alias变化不影响历史 exact mapping；
19. 历史 mapping缺失不 fallback current；
20. default/fallback Profile load=0、mapping load=0；
21. max Profile/Mapping exact load各恰好一次；
22. conflict/unavailable 时八类上游计数全 0；
23. public Contract/Receipt/log/UI raw material与 mapping digest命中数 0；
24. 架构扫描证明不存在先算 Profile revision 再回填 Strategy digest 的循环实现。

禁止 `.skip/.only/@Disabled`、真实 Secret、公网 Provider、sleep 证明时序或 schema parse 失败冒充 typed mapping
preflight 失败。

## 6. 聚焦复核问题

技术负责人只需确认以下六项，不重新完整评审 DFI-5.3：

1. 是否接受 Strategy commitment 排除派生 `profileRevision/profileDigest`，从而消除循环；
2. 是否接受 Strategy digest 继续承诺 raw directive，而 full private mapping digest 再承诺 exact Profile ref；
3. 是否接受 `mappingRevision = mappingDigest` 且二者不进入自身 material；
4. 是否接受 safe Profile 继续完全复用现有 Contract/helper，不修改 public schema；
5. 是否接受发布与 dispatch 两处都重算双摘要并精确校验；
6. 是否接受历史 mapping 缺失/漂移失败关闭且八类上游副作用全 0。

聚焦差异复核已以 `P0=0 / P1=0 / P2=0 / P3=2（非阻断）` 通过并由用户正式接受；P3-1/P3-2 已作为
编码前文档小修吸收。既有 DFI-5.3.1 单独编码授权自 2026-08-27 起恢复有效。
