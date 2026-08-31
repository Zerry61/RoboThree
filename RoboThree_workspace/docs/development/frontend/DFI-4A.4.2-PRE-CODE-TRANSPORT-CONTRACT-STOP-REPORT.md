# DFI-4A.4.2 编码前 Transport Contract 停手报告（Revision 2）

> 状态：**A2 ACCEPTED / STOP CLOSED / CODING AUTHORIZED**  
> 日期：2026-08-29  
> 范围：只记录 DFI-4A.4.2 编码前 exact Contract 差异；未修改代码、Contract、依赖、migration 或 lockfile

## 1. 第一轮触发事实：delete

DFI-4A.4.2 已通过独立文档复核并获得用户编码授权。实施前对 frozen transport/broker Contract 做 exact 对照时发现：

- `personal-credential-broker.v1` 的 command union 已包含 `create | update | delete | reveal`；
- `personal-credential-transport.v1` 的 operation/ticket/prepared-command union 只包含
  `create | update | reveal`；
- `PersonalCredentialTransportProductionController` 的 mutation 分支只处理 create/update，其他分支按 reveal
  处理，无法用现有 frozen ticket 合法表达 delete；
- 已接受方案要求 delete 复用同一 durable mutation transport、body 长度为 0，同时禁止改写 historical
  STRM Harness/Evidence。

用户已接受方案 A：delete 经 safe Core command 调用同一 durable Coordinator，并传入 zero Secret；不修改
frozen STRM v1，不建立第二套状态机。该项现已关闭。

## 2. 第一轮选项与已接受结论

### 方案 A：Delete 保持 safe control plane，Core 内部执行空 Secret（推荐）

- create/update/reveal 继续使用 STRM MessagePort + fd4/fd5；
- delete 的 safe JSON command 经 Core prepare 后，在 Core 内部调用同一
  `PersonalModelCredentialCoordinator.executePrepared(..., secret = Uint8Array(0))`；
- 仍复用同一 Journal/Receipt/Operation Gate/Keychain delete/recovery 状态机，不建立第二套业务状态机；
- 不传输 Secret，不扩写 frozen STRM v1，不改历史 Evidence；
- focused QA 把“delete 走同一 transport”精确修正为“delete 走同一 durable Coordinator，敏感 body 不存在”。

风险：与原方案 §2.3“delete 也走相同 mutation transport”字面不同，需要聚焦修订确认；安全权限没有扩张。

### 方案 B：新增 additive personal-credential-transport.v2

- v1 完全 byte freeze；
- 新增 v2 operation union，允许 delete 的 zero-body ticket/frame；
- Main/Preload/Controller/Adapter/Broker handoff 全部 single-dispatch；
- 需要新增 transport v2 Contract、Threat Model delta、兼容矩阵和独立 lifecycle evidence。

风险：范围和工期显著扩大，等同新增 STRM 子批，不应在 DFI-4A.4.2 内无评审实施。

### 方案 C：原地扩写 STRM v1（拒绝）

会改变已关闭 Contract 的接受集合，使 STRM-0～STRM-3 historical byte/evidence 语义失效，违反只读历史纪律，
不得采用。

## 3. 第一轮结论

方案 A 已由用户正式接受。删除没有 Renderer Secret，绕行 MessagePort 不会降低敏感传输保护；关键安全与一致性仍由同一
Coordinator、authority、usage guard、Operation Journal、Receipt、Keychain delete 和 durable recovery 保证。

建议聚焦修订的唯一语义为：

```text
create/update/reveal -> STRM MessagePort + fd4/fd5
delete               -> safe Core command + same durable Coordinator + zero Secret
```

## 4. 第二轮触发事实：metadata-only update

恢复编码后继续做 exact Contract 对照，发现 update 还存在一处分支差异：

- public v1alpha2 计划冻结 `updatePersonalModel(command, apiKeyBytes?)`，其中 `apiKeyBytes` 可省略；
- `PersonalModelCredentialCoordinator` 已明确区分 `credentialMutation = reuse_existing | replace_secret`；
- Coordinator 对 `reuse_existing` 要求 Secret 长度恰为 0，对 `replace_secret` 要求非空 Secret；
- frozen STRM v1 只有统一的 `update` operation，Main/Preload/Broker 路径把全部 update 视为 mutation body，无法表达
  “metadata-only update + zero Secret”；
- Renderer 不持有旧 Secret，也不得为了填满 STRM body 先 reveal 再回传。

因此，“所有 update 都继续走 STRM”与“metadata-only update 复用旧 Credential”不能同时成立。若直接继续，只能
偷偷取消 metadata-only update、伪造 Secret，或扩写 frozen STRM v1，三者均违反已接受方案。

## 5. Revision 2 推荐修订（方案 A2）

```text
create                         -> STRM MessagePort + fd4/fd5 + non-empty Secret
update / replace_secret        -> STRM MessagePort + fd4/fd5 + non-empty Secret
update / reuse_existing        -> safe Core command + same durable Coordinator + zero Secret
delete                         -> safe Core command + same durable Coordinator + zero Secret
reveal                         -> STRM MessagePort + fd4/fd5
```

该修订遵循“是否实际存在 Secret bytes”决定 transport 的原则：

- safe Core 分支仍先 durable prepare，再调用同一 `executePrepared()`；
- update/delete 仍共享同一 authority、Journal、Receipt、Operation Gate、Keychain 与 recovery 状态机；
- safe JSON 不携带 Secret、Credential Reference、Keychain account 或 Helper path；
- 不新增 transport v2，不扩写 frozen STRM v1，不改历史 Harness/Evidence；
- v1alpha2 八方法、readiness、leak/resource 与全部下游 GATED 边界不变。

## 6. 用户决策与恢复授权

用户已正式接受 A2 并恢复 DFI-4A.4.2 编码授权。实施必须保持：

- 不取消或降级 metadata-only update；reuse-existing update 使用 safe Core command + zero Secret；
- 不让 Renderer reveal 旧 Secret 后回传；
- 不修改 frozen STRM v1，不创建 transport v2；
- create、replace-secret update 与 reveal 继续使用 STRM MessagePort + fd4/fd5；
- delete 使用 safe Core command + same durable Coordinator + zero Secret；
- DFI-4A.4.3、Renderer Personal Model UI 与其他下游继续 `GATED`。
