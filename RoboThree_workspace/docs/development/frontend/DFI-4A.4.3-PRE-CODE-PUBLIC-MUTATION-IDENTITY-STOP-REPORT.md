# DFI-4A.4.3 编码前 Public Mutation Identity 聚焦停手报告

> 日期：2026-08-29  
> 状态：**IMPLEMENTATION STOPPED / USER DECISION REQUIRED**  
> 范围：只读 Contract / Core / Main / Preload exact API 核对；未创建 DFI-4A.4.3 产品代码、测试、Fixture、Harness 或 Evidence

## 1. 结论

DFI-4A.4.3 在实现真实 Renderer→Preload→Main→Core 的 create→reveal→replace→delete 闭环前，发现现有
`personal-model-management.v1alpha2` 公开接口无法让调用方构造 update、delete 或 reveal 命令：

- `PersonalModelSafeProjectionV1Alpha2Schema` 只公开 `configurationRevision`；
- `UpdatePersonalModelCommandV1Alpha2Schema`、`DeletePersonalModelCommandV1Alpha2Schema` 与
  `RevealPersonalModelKeyCommandV1Alpha2Schema` 均强制要求 `expectedExecutionDefinitionDigest`；
- List/Detail、Receipt、Compatibility、Preload 八方法及 Renderer surface 均没有该值的可信来源；
- Core 内部持有该事实，但当前 Main/Preload 不能替 Renderer 伪造，也不能从 `configurationRevision` 推导。

因此 create 可以由公开 API 发起，但后续 reveal/replace/delete 只能依赖测试直接读取 persistence 或手工注入 private
digest。这不构成真实 Desktop E2E，也不能作为 Frontend Handoff。

## 2. 为什么必须停手

继续编码至少会落入以下一种不允许的做法：

1. 修改已冻结 v1alpha2 Contract，触发方案停手条件 #1；
2. 复制或绕开既有 Coordinator/Receipt/Recovery 状态机，触发停手条件 #15；
3. 让测试从 SQLite/private Core state 读取 digest 再冒充 Renderer 输入，违反真实 E2E 与 authority 边界；
4. 让 Renderer/Main 把 `configurationRevision` 当作 execution digest，破坏 exact optimistic-concurrency 校验；
5. 在 Main 隐式选择 current definition，造成 TOCTOU，并使用户提交的 expected identity 不再真实。

这不是 production Helper 缺失导致的预期 unavailable，也不是测试环境问题，而是已经关闭的 DFI-4A.4.2 public
command surface 与 read projection 之间的可用性缺口。

## 3. 精确证据

- `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts`
  - `PersonalModelSafeProjectionV1Alpha2Schema`：公开 `configurationRevision`，无 execution identity；
  - update/delete/reveal 三个 schema：均要求 `expectedExecutionDefinitionDigest`；
- `apps/desktop/src/preload/create-desktop-api.ts`
  - 八方法对命令做 strict Contract parse，不存在可信补值路径；
- `apps/desktop/src/main/personal-model-v1alpha2-ipc-router.ts`
  - Main 只转发已解析命令并进行 runtime lease 校验，不持有可安全回填的 projection lease；
- `services/core/src/application/personal-model-management-command-service.ts`
  - 三类命令将调用方提供的 expected execution digest 原样交给 durable Coordinator。

全仓 exact 搜索确认：公开 Personal Model v1alpha2 namespace 中没有其他读取端点返回 execution identity。

## 4. 建议修订方向

推荐另立一个聚焦 additive Contract 子批，不改写 frozen v1alpha2：

```text
DFI-4A.4.2 repair.1 — Personal Model Public Mutation Identity Contract
```

建议使用新的 exact subpath/version（例如 v1alpha3），在安全投影中公开 content-free、不可伪造用途的并发控制 identity：

```text
mutationIdentity = {
  configurationRevision,
  executionDefinitionDigest
}
```

update/delete/reveal 必须原样回传该 exact pair；Core 仍是唯一 authority，Main/Preload 不推导 current 值，revision
漂移继续 typed fail-closed。新版本应 additive single-dispatch，v1alpha1/v1alpha2 byte frozen，并在 Renderer UI 编码前
完成独立文档评审、实现、QA 与用户接受。

不推荐直接修改 v1alpha2，也不推荐只暴露一个可被误解为普通展示字段的裸 digest。

## 5. 当前边界

- 已完成并保留：DFI-4A.4.3 计划评审与 readiness/test identity docs-only 精度修订；
- 本轮未创建 DFI-4A.4.3 code/test/fixture/Harness/Evidence，未修改 Contract、依赖、migration 或 lockfile；
- DFI-4A.4.1、STRM-3、DFI-4A.4.2 历史关闭结论不被推翻；缺口作为后续 additive repair 处理；
- DFI-4A.4.3、Renderer Personal Model UI、正式签名 Helper 与其他下游继续 `GATED`。

## 6. 需要用户确认

用户已授权输出
[DFI-4A.4.2 repair.1 Public Mutation Identity Contract 聚焦详细方案](./DFI-4A.4.2-REPAIR.1-PUBLIC-MUTATION-IDENTITY-CONTRACT-DEVELOPMENT-PLAN.md)
并进行文档评审。当前 repair.1 为 `DOCUMENT REVIEW PENDING / CODING GATED`；在该 repair 独立关闭并由用户重新
明确恢复授权前，DFI-4A.4.3 继续停止编码。
