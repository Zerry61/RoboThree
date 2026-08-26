# ADR-013：Personal Credential Store 与受控 Broker 边界

> 状态：**ACCEPTED**  
> 提出日期：2026-07-24  
> 接受日期：2026-07-24  
> 适用范围：Desktop 个人 Model Credential 创建、替换、解析和删除  
> 前置决策：ADR-001、ADR-004、ADR-006、ADR-008、KN-025  
> 接受依据：用户明确接受；Claude Code 独立文档复核 P0/P1/P2/P3 新增问题为 0；KN-026

## 1. 决策

Local Core Application 拥有：

- 个人 Model 生命周期；
- Credential 业务生命周期；
- Personal Model 与 opaque Credential Reference 的关联；
- 调用个人 Model 前的 Credential 解析意图。

建立类型化 `PersonalCredentialStore` Port：

```text
store
replace
resolve
delete
```

首选实现是 Local Core 进程中的 OS Keychain Adapter。只有 Local Core 无法在目标操作系统稳定调用 Keychain 时，才允许 Electron Main 作为极窄 Credential Broker；Broker 仍只实现该 Port 语义，不成为通用 Secret 服务。

## 2. 敏感链路

```text
Desktop Renderer
→ context-isolated Preload
→ Electron Main
→ 受控敏感通道
→ Local Core Application
→ PersonalCredentialStore
→ OS Keychain
```

- Renderer 只采集一次用户输入，不持久化 Secret；
- Main 不把 Secret 放入普通 localhost HTTP、URL、命令行参数或日志；
- Main/Core 优先使用继承 IPC、匿名管道或等价的不暴露于命令行参数的受控通道；
- Local Core 成功保存后只持久化 opaque credential reference 和凭证状态；
- Model Provider Adapter 通过 PersonalCredentialStore/Resolver 在调用时解析，解析值不进入 Task、Event 或 Audit。

## 3. OS Keychain Adapter

首期目标平台为项目实际支持的 macOS；Windows Adapter 在 Windows MVP 分发前完成。Adapter 必须：

- 使用操作系统用户级安全存储；
- 生成随机、不可推导 Secret 的 opaque reference；
- 区分 not_found、unavailable、access_denied、corrupted 和 internal；
- Keychain 不可用时失败关闭，个人 Model 显示 unavailable；
- replace 不能改变 Personal Model ID；
- delete 后旧 reference 不再可解析；
- 不在普通错误详情中返回 Secret、原始 Keychain item 或系统敏感路径。

## 4. 禁止进入的边界

Personal Model Secret 不得进入：

- URL、query string 和命令行参数；
- 普通 HTTP/SSE payload 或访问日志；
- Renderer store、localStorage、IndexedDB；
- SQLite；
- Session、Conversation、Task、Event、Checkpoint、Receipt、Effect、Outbox；
- Enterprise configuration；
- Audit；
- Contract Fixture、测试 Snapshot 和 golden file；
- 普通错误详情；
- 常规诊断信息和应用维护的 crash metadata。

测试只使用明确标记的 Fake Credential，不使用真实用户 Secret。

## 5. Runtime Handle 与 Contract

- Secret 和解析后的 Credential 不进入公共 Contract；
- `credentialRef` 只在受控基础设施 Descriptor/个人 Model 本地描述中作为 opaque reference；
- Runtime Credential value 只存在于调用所需最短生命周期；
- 不缓存到 RegistrySnapshot、TaskRuntimeSelection、TaskCapabilityLock 或 ModelRequest；
- Credential unavailable 只能收窄能力，不触发静默切换企业/个人 Model。

## 6. 不覆盖范围

- 企业 Model/Tool/Knowledge Credential；
- Central Secret Store；
- 企业 Credential Reference 生命周期；
- 正式 SSO、复杂 RBAC 和组织隔离；
- 多用户共用设备的完整隔离模型；
- 企业 Credential Rotation 平台；
- 通用 Secret Marketplace 或插件凭证系统。

## 7. 接受结论与编码门槛

本 ADR 已确认：

1. Local Core Application 是业务所有者；
2. PersonalCredentialStore Port 语义固定；
3. 目标平台 Keychain Adapter 运行位置可行；
4. 受控敏感通道不使用普通 HTTP、URL 或命令行参数；
5. Secret 禁止进入列表具有架构测试和日志脱敏方案；
6. Keychain unavailable 明确失败关闭。

本 ADR 的接受只冻结 Credential 所有权和安全边界。OS Keychain Adapter、受控 Broker、日志脱敏和敏感通道自动化必须在 DCF-3 个人 Model 批次中独立验收；DCF-0 不传递或保存任何 Credential。
