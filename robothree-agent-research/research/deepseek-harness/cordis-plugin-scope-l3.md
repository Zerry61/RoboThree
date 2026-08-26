# L3 深挖 — Cordis 插件架构 + Scoped Registration

> 机制 1/3。回答：DeepSeek Harness 如何用“一切皆插件”组装整个 agent，以及 per-agent 的 scoped registration 如何工作。
> 全部结论 Confirmed by: source。

## 1. 一句话结论

`[F]` DeepSeek Harness 把 agent harness 的**每一个部件**（模型适配器、工具注册表、session 日志、agent 循环本身）都实现为 Cordis 插件，挂到一个共享 `Context` 上；插件通过 **service injection**（DI）+ **reversible effects**（生命周期）+ **scope chain**（作用域隔离）组合。没有 privileged core，扩展方式是“在旁边再挂一个插件”，而不是“patch 核心循环”。

## 2. Context：Proxy 化的 DI 容器

- `[F]` `Context` 是 Proxy：普通属性读取 `ctx.<name>` 走 `ReflectService.handler` 的 service resolver；`ctx.get(name)` 是严格读取全局 store（[context.ts:42-84](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L42-L84)）。
- `[F]` 三个 scoped 子 context 操作（不 mutate 父）：
  - `extend(meta)` — 原型继承 + own property shadow（[context.ts:99-107](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L99-L107)）。
  - `isolate(name, label)` — 为某 service 名建立独立 service scope，同一 label 两次调用 join（[context.ts:121-125](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L121-L125)）。
  - `intercept(name, config)` — 给 service 挂 per-plugin intercept config（[context.ts:139-145](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L139-L145)）。
- `[F]` 隔离/拦截 map 存在 symbol 键 `[symbols.isolate]` / `[symbols.intercept]`（[context.ts:17-20](../../sources/deepseek-harness/vendor/cordis/src/context.ts#L17-L20)）。

> `[I]` 这意味着“服务作用域”与“上下文继承”是两个正交维度：`extend` 控制可见性继承，`isolate` 控制同名服务的替换边界。RoboThree 若要支持 per-agent 覆盖某个服务（如某 session 用不同的 fs 后端），`isolate` 是现成的范式。

## 3. Service 注入：注册即绑定、卸载即移除

- `[F]` `Service` 基类构造 `super(ctx, name)` 即 `ctx.reflect.provide(name, self, this[Service.check])`，service 随 owning fiber 卸载自动移除（[service.ts:42-59](../../sources/deepseek-harness/vendor/cordis/src/service.ts#L42-L59)）。
- `[F]` `Service[check]` 是 availability 谓词；`Service[invoke]` 使 service 可调用（如 `ctx.logger()`）；`Service[resolveConfig]` 做 intercept config 合并（[service.ts:13-25](../../sources/deepseek-harness/vendor/cordis/src/service.ts#L13-L25)、[service.ts:86-102](../../sources/deepseek-harness/vendor/cordis/src/service.ts#L86-L102)）。
- `[F]` 服务名通过 declaration merging 声明：每个 service 包写 `declare module '@deepseek-ai/cordis' { interface Context { <name>: <Type> } }`（如 [sandbox/index.ts:146-150](../../sources/deepseek-harness/packages/sandbox/sandbox/src/index.ts#L146-L150)）。

## 4. Plugin 形态与依赖

- `[F]` `Plugin` 三种形态：`Function(ctx, config)` / `Constructor` / `{ apply(ctx, config) }`；统一由 `resolve()` 归一化到 callback（[registry.ts:92-133](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L92-L133)、[registry.ts:222-228](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L222-L228)）。
- `[F]` 依赖声明 `inject`（数组或 name→config map）；`@Inject` decorator（class 或 method 级，method 级延迟到依赖可用）（[registry.ts:19-60](../../sources/deepseek-harness/vendor/cordis/src/registry.ts#L19-L60)）。
- `[F]` `Config`（standard-schema）在 plugin 启动前校验，失败抛 `ValidationError`（[fiber.ts:50-62](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L50-L62)）。

## 5. Fiber 生命周期：依赖感知的 reload

- `[F]` `FiberState`：`PENDING → LOADING → ACTIVE`，失败 `FAILED`，卸载 `UNLOADING → DISPOSED`（[fiber.ts:147-154](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L147-L154)）。
- `[F]` 关键机制 **epoch-based reload**：`inject` 的每个依赖实现变化（`_checkImpl` → `_refresh` → `_setEpoch`）会触发 fiber unload + reload；依赖不可用时 fiber 停在 `PENDING`（[fiber.ts:597-639](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L597-L639)、[fiber.ts:646-696](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L646-L696)）。
- `[F]` `update(config)` 走 `internal/update` waterfall（HMR 可 veto/替换），默认 `restart()`（[fiber.ts:736-753](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L736-L753)）。
- `[I]` 这是与“进程重启才重配”的传统插件系统最本质的区别：**依赖和配置都是运行时可替换的，且替换是局部的**。这直接支撑了“模型适配器、工具、session 都可热替换”的产品能力。

## 6. Effects：可逆注册，逆序 unwind

- `[F]` `ctx.effect(execute, label)` 立即执行 body，收集 disposer；disposer 逆序运行（fiber unload 或显式 dispose，先到者生效）（[fiber.ts:415-561](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L415-L561)）。
- `[F]` effect body 支持 sync disposer / promise / (async) iterable（generator 逐个注册）（[fiber.ts:83-93](../../sources/deepseek-harness/vendor/cordis/src/fiber.ts#L83-L93)）。
- `[F]` `ctx.on()` 注册 listener 也是 effect，随 fiber 卸载自动移除；`prepend`/`global` 选项控制顺序与 filter 豁免（[events.ts:288-302](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L288-L302)）。
- `[F]` `Service.register()` 模式贯穿全仓：`tools.register()` 返回 disposer；`tools.restrict()` / `tools.guard()` 同理（[tools/index.ts:1057-1116](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L1057-L1116)）。

## 7. 五种事件分发（waterfall 是扩展核心）

- `[F]` `DispatchMode = emit | parallel | serial | bail | waterfall`（[events.ts:32](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L32)）。
- `[F]` `waterfall`：listener 围绕 `next()` 组合，不调 `next()` 即 veto 后续链（[events.ts:234-243](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L234-L243)）。
- `[F]` dispatch 前经 `thisArg[Context.filter]` 过滤：只投递给 filter 通过的 listener（[events.ts:165-175](../../sources/deepseek-harness/vendor/cordis/src/events.ts#L165-L175)）。
- `[F]` 事件类型 declaration merging 扩（`Events` / `SessionEventMap` / `ContentBlockMap` 等 merge-extensible map），`switch (event.type)` 收窄 `event.data`（[session/types.ts:404-436](../../sources/deepseek-harness/packages/core/session/src/types.ts#L404-L436)）。

## 8. Scoped Registration（per-agent 隔离）

这是 DeepSeek Harness 对 Cordis 的**关键扩展**（`packages/core/scope`）。

- `[F]` `createScope(ctx, key)`：以 `key` 为 opaque identity，`ctx.plugin(scope)` 建一个 backing fiber，`fiber.ctx.extend({ [kScope]: key })` 得到 scoped context；返回 `{ ctx, rawDispose, dispose }`（[scope/index.ts:137-147](../../sources/deepseek-harness/packages/core/scope/src/index.ts#L137-L147)）。
- `[F]` `scopeTarget(base, key)`：建 routing-only carrier，`[Context.filter]` 保留 base filter + 准入与 key 或其祖先匹配的 tag（[scope/index.ts:170-185](../../sources/deepseek-harness/packages/core/scope/src/index.ts#L170-L185)）。
- `[F]` **双向作用域链**（一个关系驱动两个方向）：
  - 注册视图**向下继承**：child scope 看得到 ancestor layers（`ScopedLayers`）。
  - 事件准入**向上扩展**：tag 为 ancestor 的 listener 收到 descendant scope 的 event（[scope/index.ts:32-39](../../sources/deepseek-harness/packages/core/scope/src/index.ts#L32-L39)）。
- `[F]` `bindScopeParent(key, parent)` cycle-checked 绑定，返回唯一可 re-link 的 binding；scope 祖先链只可被原 binder 移动（[scope/index.ts:54-82](../../sources/deepseek-harness/packages/core/scope/src/index.ts#L54-L82)）。
- `[F]` `ReactLoopAgent` 用 `this.scope = createScope(loopCtx, this)` + `this.ctx = this.scope.ctx.extend({ agent: this })` 建 per-agent 注册边界（[agent.ts:94-95](../../sources/deepseek-harness/packages/core/agent-loop/src/agent.ts#L94-L95)）。

> `[I]` scope 链的“继承下/准入上”是精妙设计：一个 standing composition（如一个 agent preset）可以观察它下面每个 agent 的事件（ancestor listener 收到 descendant event），而每个 agent 的注册又被祖先的 layer 覆盖。这解决了多 agent 里“全局观察 + 局部覆盖”两难。

- `[F]` `ToolRuntime` 用 `ScopedLayers`（`global` 层 + 每条 scope 链的层）做 per-scope tool 注册 / restrict / guard / presentAs（[tools/index.ts:811-814](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L811-L814)、`modeFor()` 走 `chainLayers(scope)` 取最近覆盖 [tools/index.ts:900-911](../../sources/deepseek-harness/packages/core/tools/src/index.ts#L900-L911)）。

## 9. 对 RoboThree 的直接启示

1. `[R]` **“注册即 effect、卸载即 unwind”** 应作为 RoboThree 插件/Skill/Hook 的统一生命周期语义：一个能力的 register() 返回 disposer，framework 负责逆序清理，避免“半卸载”状态。
2. `[R]` **waterfall 作为默认扩展模式**：`agent/pre-step` / `tools/pre-execute` 等都要求 listener 显式 `next()` 委托，天然支持 allow/deny/rewrite/veto。RoboThree 的 permission 拦截链可借鉴。
3. `[R]` **scope 链（继承下/准入上）** 是 per-agent 能力隔离的现成范式，可直接对齐 RoboThree 的 multi-agent 隔离需求（每个 subagent 独立 ToolSet/权限，同时父 agent 可观察子 agent）。
4. `[R]` **epoch-based 依赖感知 reload** 支撑“运行时替换 provider”而不重启进程，是 RoboThree 若要做 hot-reload Skill/Plugin 时的关键机制参考。

## 10. 风险 / 局限

- `[I]` DI + Proxy + isolate/intercept + scope 链组合的心智负担高；RoboThree 若全盘采用需评估团队学习成本。
- `[I]` 类型靠 declaration merging 扩（`Context` / `Events` / `SessionEventMap`），跨包类型合并易产生 `ts.Program` 冲突（本项目因此拆 Host/Client 双 aggregate，见 development.md）。RoboThree 若用 TS 需注意此坑。
- `[UNKNOWN]` Cordis 的 `reflect`（Proxy 拦截）在极端并发下的性能未实测。
