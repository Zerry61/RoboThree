# MVP-RSL-1 实施停手报告

> 日期：2026-08-30  
> 状态：`IMPLEMENTATION STOPPED / FOCUSED REPAIR DECISION REQUIRED`  
> 范围：仅记录 RSL-1 Step 1 实施中发现的计划事实冲突，不构成下游授权

## 1. 已完成且保留的 Step 1 工作

- 新增 consumer-driven `@robothree/contracts/agent-lifecycle/v1alpha1` strict schema；
- 新增 1 个 Contract focused test 文件，实测 `1 file / 8 tests PASS`；
- 新增 Central `RobotAvatarImageValidator`，使用 JDK `ImageIO` 对 PNG/JPEG 做真实格式、尺寸、像素与完整解码
  校验，不新增依赖；
- 新增对应 Java focused test 源码；当前执行宿主没有默认 JDK/Maven，尚未运行，不能宣称 PASS；
- 起草 Central `U0012__agent_lifecycle_from_v0011.sql` upgrade schema；尚未形成完整 v12 deployment set，未执行。

以上改动均未接入 production graph，未修改 frozen Contract、Core migration、依赖或 lockfile。

## 2. 停手原因一：Token 单副本约束与 Core 重启互斥

已接受方案同时要求：

1. Agent lifecycle Token 只在 Core 私有内存持有；
2. Desktop Main 与 Core 环境变量均立即删除；
3. Core SIGKILL 后重启仍能访问 Central 并恢复 RSL-1 链路。

但 Electron 的 Core child 被 SIGKILL 后，其内存 Token 一并消失。如果 Main 不保留任何私有 lease，又没有 production
identity/token renewal，本批无法为新 Core child 提供同一预签 Token。继续编码只能在以下错误方案中选择：

- Core 重启后 Agent lifecycle fail-closed，违反联合 E2E；
- 把 Token 存入 SQLite/文件/Keychain，违反本批边界；
- 新建 Token renewal/identity 服务，越权进入 production identity；
- 由 Renderer 或环境重新提供 Token，违反安全边界。

### 推荐聚焦修订 A

复用 VS1 已验证的 supervisor 纪律：

- Main 启动时从 `process.env` 一次性读取并立即删除目标变量；
- Main 只在 private `Buffer` lease 中持有 Token，绝不投影至 Renderer/Preload/IPC/日志/SQLite；
- 每次 spawn Core child 时构造一次临时 child env；fork 返回后删除临时字段；
- Core Provider 读取 child env 后立即删除，并持有自身 immutable in-memory lease；
- Main 退出时 `Buffer.fill(0)`；
- Core restart 复用 Main private lease，不增加 renewal、Keychain、Helper 或 production identity。

这会把原“仅 Core 私有内存”精确修订为“仅 Desktop Main supervisor 与 Core process 的私有内存”，不扩大产品能力。

## 3. 停手原因二：Central v12 是 deployment set，不是单一 upgrade 文件

Central 当前 schema authority 不是运行时 Flyway 自动迁移，而是 manifest 管理的 deployment artifacts。每个版本包含：

```text
baseline/B0012__agent_lifecycle.sql
upgrade/U0012__agent_lifecycle_from_v0011.sql
manifest/postgresql-v0012.json
manifest/postgresql-v0012.json.sha256
```

并需要同步 classpath resources、`SchemaManifestLoader` target/version/entry path 和只读 schema preflight。方案
Revision 1 只固定了 `U0012`，若只提交 upgrade 文件，新数据库无法 fresh install，application preflight 仍只接受 v11。

### 推荐聚焦修订 B

- 将“Central 唯一 migration U0012”修订为“Central 唯一 schema version v12 deployment set”；
- B0012 与 U0012 是同一 schema version 的 fresh/upgrade 两条入口，不算两个业务 migration；
- Core SQLite migration 仍止 26；
- 不启用 runtime auto-migration，不新增依赖。

## 4. 未授权与未完成

- Central lifecycle store/service/controller 尚未实现；
- Core BFF、真实测试 Task、managed Agent source 尚未实现；
- Desktop 7 方法与页面尚未实现；
- Admin review Adapter/page 尚未实现；
- 联合 E2E 尚未实现；
- RSL-1 不能标记 implemented、PASS 或 CLOSED。

## 5. 恢复条件

用户接受聚焦修订 A+B 后，可恢复原 RSL-1 编码授权并继续 Step 1。无需扩大到 SSO/RBAC、Token renewal、Keychain、
Helper 或新状态机；其他下游继续 GATED。
