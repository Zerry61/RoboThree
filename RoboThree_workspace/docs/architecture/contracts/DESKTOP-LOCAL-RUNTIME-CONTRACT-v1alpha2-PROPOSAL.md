# Desktop Local Runtime Contract v1alpha2 — Enterprise Configuration Status

> 状态：**IMPLEMENTED — INDEPENDENT QA PENDING**  
> 日期：2026-07-25  
> 基线：Desktop Local Runtime Contract `v1alpha1 ACCEPTED`  
> 范围：只增加企业配置同步与激活状态 Projection/Event；不实现 Desktop UI

## 1. 为什么建立新 revision

`v1alpha1` 的 Zod/Fixture 使用 strict object 和 discriminated union：

- `DesktopFeatureSchema` 没有 enterprise configuration status feature；
- Durable Event union 没有 `enterprise_configuration.status_changed`；
- Compatibility/Runtime Status 只有 `pendingRuntimeActivation` 布尔字段。

直接向 `v1alpha1` strict union 增加事件会让旧客户端遇到未知类型时失败，不能
静默修改已接受 Contract。因此 CGF-1.2 采用明确的 `v1alpha2` revision 和
compatibility negotiation；`v1alpha1` Schema/Fixture 保持不变。

## 2. Feature

`v1alpha2` 增加：

```text
enterprise_configuration_status
```

只有 Desktop Main 与 Local Core 都支持该 Contract revision 和 feature 时，才
使用新的 Query/Event。Renderer 不自行推断兼容性。

## 3. EnterpriseConfigurationStatusProjection

最低语义：

```text
contractVersion: v1alpha2
syncState:
  idle | syncing | failed
activationState:
  uninitialized | current | pending_restart | activation_failed
storageActiveRevision?
runtimeActiveRevision?
lastSuccessfulSyncAt?
lastErrorCode?
```

规则：

- Projection 是 Local Core Application read model；
- activationState 由持久化 pointer/failure facts 纯派生；
- `syncing` 来自当前有界同步协调状态；
- `lastErrorCode` 只能是安全、类型化 code；
- 不返回 Snapshot、Package、固定权限正文、企业身份明文、Token、OA material、
  本地路径或 SQLite 细节。

## 4. pendingRuntimeActivation 兼容语义

`v1alpha1` 已有的 `pendingRuntimeActivation` 不成为第二事实源。兼容 Adapter
按以下规则生成：

```text
pendingRuntimeActivation =
  EnterpriseConfigurationStatusProjection.activationState == "pending_restart"
```

不存在独立写命令、独立布尔列或双向同步。

## 5. Typed durable event

`v1alpha2` 增加：

```text
enterprise_configuration.status_changed
```

最低安全 payload：

```text
activationState
syncState
storageActiveRevision?
runtimeActiveRevision?
lastErrorCode?
statusQueryRef
```

规则：

- Storage Activation 成功后必须产生 durable status change；
- 终态同步失败可以产生同类型安全事件；
- `syncing` 进度可以只通过 Query/ephemeral projection 表达，不产生高频 durable
  Event；
- Event 与配置 pointer/failure fact 在同一配置领域事务提交；
- Desktop durable cursor 保持不透明；未来 Event bridge 可以组合多个领域游标，
  不把 SQLite sequence 暴露为公共 Contract；
- Event 不携带 Snapshot/Package 正文、身份明文、Token、OA material、
  Credential reference 或本地路径。

## 6. 所有权

```text
EnterpriseConfigurationPersistence
  owns durable pointer/failure/status-event facts
        ↓
EnterpriseConfigurationStatusProjector
  derives typed Application projection
        ↓
Desktop Local v1alpha2 Query/Event Adapter
  maps projection and durable event
        ↓
Electron Main / Preload / Renderer
  later DCF batch displays status
```

该链不进入 Kernel reducer、TaskRuntimeSelection、TaskCapabilityLock 或企业
Configuration Snapshot。

## 7. CGF-1.2A 交付门槛

CGF-1.2A 编码时必须：

- 建立 `v1alpha2` strict Schema/Fixture；
- 保留 `v1alpha1` 原 Fixture 全量回归；
- 验证 feature negotiation；
- 验证 pending boolean 只由 activationState 派生；
- 验证安全字段禁入；
- 不实现 Desktop UI、重启按钮或 Runtime Activation。
