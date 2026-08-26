# ADR-013 补充修订 A：个人 Credential Reveal 与 macOS Keychain 实现边界

> 状态：**ACCEPTED / DFI-4A.2 IMPLEMENTATION VERIFIED / PASS/CLOSED**  
> 提出日期：2026-08-20  
> 基础 ADR：[ADR-013](./013-personal-credential-store-broker.md)  
> 产品依据：`MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` Revision 1  
> 适用范围：个人模型 Credential 的 store / replace / resolve / delete / owner reveal  
> 编码门禁：用户已正式接受本 Addendum、关闭 DFI-4A.2.2，并单独授权 DFI-4A.2.3；DFI-4A.3、DFI-4A.4 与其他后续批次继续 GATED

## 1. 背景

ADR-013 已冻结 PersonalCredentialStore 的所有权和正向调用边界，但没有定义“所有者主动查看已保存
个人 Key”的反向敏感通道。Model Experience Spec 已经确认该产品能力，因此本 Addendum 不再讨论
是否允许 reveal，只冻结实现边界。

DFI-4A.0 repair.1 开发者门禁已用随机测试 Secret 验证隔离临时 Keychain 的
store/resolve/replace/delete、lock/unlock、wrong-password `access_denied`、受控 `corrupted`、broker
`cancelled`、helper mutation 前后异常退出恢复，以及隔离 Keychain 内 modern
`SecItemAdd/CopyMatching/Update/Delete` 生命周期。repair.1 没有写入默认登录 Keychain；生产签名 helper、ACL 与安装包生命周期仍需在
DFI-4A.2 E2E 中证明。repair.1 还确认当前生产
`CorePrivateSupervisor` 使用 `serialization: "json"`，不能保留敏感
Buffer，因此不能把现有 inherited IPC 直接选为敏感通道。本批没有访问用户真实 Credential，也没有修改生产
Runtime。Swift 路线因本机 compiler/SDK patch mismatch 不可用，详见
`DFI-4A.0-ADAPTER-PREFLIGHT-REPORT.md`。

## 2. 决策

### 2.1 Credential Adapter

macOS 生产实现建议固定为：

```text
Local Core Application
  → PersonalCredentialStore Port
  → Core child 启动的预编译签名 native helper
  → 匿名 stdin/stdout pipe
  → Apple Security.framework SecItem API / Keychain
```

- 不引入第三方 npm 原生 Keychain 依赖；
- Secret 通过 Main/Core child IPC 进入 Core child，再通过匿名 pipe 进入 helper；不进入 argv、env、
  临时文件或 shell；
- 生产 item 操作使用 `SecItemAdd / SecItemCopyMatching / SecItemUpdate / SecItemDelete`；
- DFI-4A.0 repair.1 自动化只使用隔离临时 Keychain，未写入默认登录 Keychain，并已验证 modern
  `SecItem*` 生命周期；生产签名身份、ACL、安装包升级/卸载生命周期仍后置到 DFI-4A.2 E2E；
- deprecated `SecKeychain*` 只用于创建、锁定、解锁和销毁隔离测试 Keychain，不进入生产 Adapter；
- `/usr/bin/security` CLI 因会把 `-w` secret 暴露到 argv，生产禁止；
- helper 生产协议使用有界 JSON metadata + 独立长度前缀原始 Secret bytes；Spike 的 base64 JSON 只用于
  随机测试数据，不作为生产 frame；
- helper 固定包内路径、签名身份、manifest digest、regular-file/no-symlink 检查必须失败关闭；
- Keychain unavailable、locked、not found、access denied、cancelled、corrupted 和 internal 必须映射为固定错误族；
- DFI-4A.0 headless harness 已真实触发 `access_denied`、受控损坏输入 `corrupted` 与 broker
  `cancelled`；broker cancellation 不冒充系统 UI 的 `errSecUserCanceled`。

若 DFI-4A.2 的已签名安装包 E2E 不能证明 `SecItem*`、签名身份和 Keychain ACL 稳定成立，必须回到
文档评审；不得退化为 SQLite、普通文件、LocalStorage 或命令行 `security -w <secret>`。

### 2.2 Main/Core 敏感通道

DFI-4A.0 repair.1 不选择复用现有 Electron Main 启动 Core 时建立的 inherited Node IPC channel。
当前生产 `CorePrivateSupervisor` 使用 `serialization: "json"`，repair.1 已证明该配置不能保留敏感
Buffer。DFI-4A.2+ 真实 Credential 路径必须在详细方案中选择独立敏感通道/helper channel，或显式改造 supervisor
serialization 并以真实生产 supervisor 回归 boot/shutdown、readiness、shutdown、crash 与敏感 Buffer
传递。

- 若选择改造 supervisor，必须显式切换并测试 `serialization: "advanced"`，使用 Buffer 传递 Secret；
- 若选择独立敏感通道，必须证明该通道不与 boot/shutdown、Core private HTTP 或普通 Desktop API 串线；
- boot/shutdown 和 Credential 消息拥有不同 discriminator 与独立 strict validator；
- 每个命令绑定 `commandId + clientInstanceId + ownerScopeDigest + personalModelId + expectedRevision + deadline`；
- Main 只做 webContents、schema、关联、deadline/cancel 与单请求返回，不解释、不缓存、不记录 Secret；
- sender callback、receiver 完成、cancel、deadline、disconnect 和异常路径都必须清零可控 Buffer；
- duplicate command、late response、wrong webContents、wrong revision 和 stale owner 一律失败关闭；
- 不宣称 JavaScript String 可被可靠清零；Renderer reveal 必须限制在局部组件生命周期，并避免复制出额外值。

### 2.3 Owner Reveal

reveal 仅适用于个人 Credential，企业 Credential 永不下发 Desktop。每次 reveal 必须：

1. 使用当前 Runtime Active 身份、Device Trust 与 `personal_model.configure` entitlement；
2. 在 Core 重新验证 owner、personal model revision 和 credential reference；
3. 绑定 `commandId + personalModelId + expectedModelRevision + clientInstanceId + webContentsId +
   ownerScopeDigest + requestDigest`，且只回发单一发起 `webContents`；
4. 不自动重放；timeout/disconnect 返回 typed uncertain/unavailable，不返回空字符串冒充成功；
5. 有界并发、频率限制和短 deadline；
6. Renderer 在隐藏、关闭、卸载、导航或窗口关闭时移除局部引用；
7. 不提供独立复制按钮，不检测系统截图；
8. 日志、Trace、Event、Receipt、Audit 和 QA Evidence 只记录安全结果、计数和 digest。

### 2.4 权限与离线

本 Addendum 不建立新会话时钟。权限直接复用 CGF-1.3 的企业离线状态：

- 状态 2：Central 暂不可达，但 Access Token、Device Trust、scope、entitlement 与 Compatibility 仍有效，
  允许同 owner 的个人模型操作和 reveal；
- 状态 3：会话或 Trust 失效，禁止新增、使用、编辑和 reveal，但同 owner 仍可删除本机模型和 Credential；
- Central 不可达本身不等于权限失效；
- 不新增离线租约、设备失联阈值、配置过期或实时撤销。

## 3. 安全不变量

1. Secret 不进入公共 Contract、HTTP/SSE、URL、argv、env、SQLite、日志、Trace、Event、Audit 或 Evidence；
2. `credentialRef` 不进入普通 Renderer Projection；
3. Main/Core/helper 均不是通用 Secret 服务，只接受固定 personal model 操作；
4. Secret 解析只维持完成单次 Provider 调用或 reveal 所需的最短生命周期；
5. 失败只收窄个人模型，不触发企业/个人模型静默互换；
6. 生产 helper 的签名、资源路径、hash 和包内权限在启动时失败关闭；
7. DFI-4A.0 的 Spike 证明可行性，不等于生产 CRUD、reveal 或 Provider 已上线。

## 4. 接受与实施状态

本 Addendum 已通过独立文档/代码事实复核并由用户明确接受，当前作为 DFI-4A.2 reveal 的正式实现依据。
DFI-4A.2.3 已完成 Foundation 实现、独立 QA 与用户接受；DFI-4A.2 阶段整体正式 `PASS/CLOSED`。
该结论不自动解锁 DFI-4A.3、DFI-4A.4，也不修改 ADR-013 已接受的其他边界。
