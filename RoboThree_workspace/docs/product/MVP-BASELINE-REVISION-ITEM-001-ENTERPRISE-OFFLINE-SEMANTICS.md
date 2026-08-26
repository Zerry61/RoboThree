# MVP 基线修订项 001：企业配置离线语义

> 状态：**ACCEPTED / CLOSED**  
> 建立日期：2026-07-25  
> 接受日期：2026-07-27  
> 触发决策：ADR-014 `ACCEPTED`、DCF-1.3 `PASS/CLOSED`、CGF-1.3 `CONFIRMED_WITH_SPECIFIED_REVISIONS`  
> 目标文档：`ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md`

## 1. 修订目的

旧 MVP 基线把“Central 暂时不可连接”笼统描述为“继续使用最近一次成功同步且
本机实际可运行的 Model、Agent、Skill、Tool 和 Knowledge 配置”。该表述没有
区分：

- Central 网络连接状态；
- Enterprise Access Token 是否仍有效；
- Device Trust 是否仍有效；
- 配置是否已经完成 Runtime Activation；
- 能力依赖是否真的可以在本地完成。

本修订按 ADR-014 收敛为四种明确状态，禁止把“缓存仍存在”误解成“企业授权仍
有效”或“配置可以自动进入 Runtime”。

## 2. 企业离线四状态

### 2.1 状态 1：企业在线

条件：

```text
Central reachable
∩ Enterprise Access Token valid
∩ Device Trust valid
∩ Compatibility valid
```

行为：

- 企业能力正常使用；
- Core 可以按用户操作发起配置同步；
- 通过完整校验后可以执行 Storage Activation；
- 需要应用新配置时，仍须经过用户确认和 Controlled Core Restart 才能执行
  Runtime Activation。

Desktop 展示：`企业在线：能力正常`。

### 2.2 状态 2：企业服务暂时不可用

条件：

```text
Central temporarily unreachable
∩ Enterprise Access Token still valid
∩ Device Trust still valid
```

行为：

- 当前已经 Runtime Active 且满足
  `LocalExecutableEnterpriseCapability` 的企业能力可以继续；
- 不下载新配置；
- 不进行新的 Storage Activation；
- 不进行新的 Runtime Activation；
- 企业 Model Gateway 和 Central Tool Gateway 不可调用；
- 历史 Task/Event/Audit 保留；
- 不静默切换个人 Model、其他 Binding、Tool 或 generation。

Desktop 展示：
`企业服务暂时不可用：当前已 Runtime Active 且完全本地可运行的能力可继续`。

### 2.3 状态 3：企业会话失效

触发条件包括：

- Enterprise Access Token 过期或无效；
- Device Trust 无效、设备不合规或已撤销；
- 企业 scope、用户或权限不再成立；
- Compatibility 校验失败。

行为：

- 企业 Agent/Skill/Model/Tool/Knowledge 不进入新的 Runtime Registry 或 Prompt；
- 不创建新的企业任务；
- 企业 Model 和 Central Tool 不可调用；
- 缓存 MaterializedEnterpriseConfiguration 只允许保留、读取、完整性校验、
  恢复诊断和审计；
- 已运行 Task 与历史事实不删除；
- 继续执行需要失效企业能力时进入 `waiting/unavailable`，不得静默 fallback。

Desktop 展示：`企业会话失效：企业能力暂停`。

### 2.4 状态 4：企业恢复

Core 自动检测 Central 恢复，检测事实来自：

- SSE reconnect；
- periodic polling；
- Access Token 有效；
- Device Trust 有效。

自动检测只产生“恢复/发现更新”状态，不自动应用配置。

```text
Central 恢复
→ Core 通过 SSE reconnect / periodic polling 检测
→ 复核 Access Token 与 Device Trust
→ Desktop 展示“发现企业配置更新，是否同步并应用？”
→ 用户确认
→ 下载并完整校验配置
→ Storage Activation
→ Controlled Core Restart
→ Runtime Activation
```

禁止 Central 恢复后在后台静默：

- 下载企业配置；
- 执行 Storage Activation；
- 执行 Runtime Activation；
- 重启 Local Core。

Desktop 展示：`企业恢复：发现新配置，等待应用`。

## 3. LocalExecutableEnterpriseCapability

企业能力只有同时满足以下全部条件，才属于完全本地可运行能力：

```text
runtimeActive generation
∩ package sealed
∩ package digest valid
∩ required dependencies available
∩ referenced Model/Tool usable
```

判断事实必须来自 `enterprise-configuration.sqlite` 中已持久化且可复核的
generation、Package、digest、依赖和 Runtime Activation 记录。

不得依赖：

- 仅存在于内存的状态；
- Renderer 或其他 UI 状态；
- 未持久化的上次运行缓存；
- “本机看起来存在”的 Adapter 或能力推断。

如果 Agent/Skill 引用企业 Model Gateway、Central Tool Gateway 或其他当前不可
用依赖，则它不属于 `LocalExecutableEnterpriseCapability`。

## 4. 恢复与安全边界

- Storage Activation 与 Runtime Activation 始终分离；
- 配置恢复不改变正在运行 Task 的 `TaskRuntimeSelection` 或
  `TaskCapabilityLock`；
- 新 Task 只能使用明确的 `runtimeActive generation`；
- 状态 4 的自动检测不等于自动同步或自动激活；
- 企业配置变化可能改变 Agent、Skill、Model 和 Tool，必须由用户确认后应用；
- 个人 Model、客户端预装且不依赖失效企业授权的本地 Tool、个人/本地 Skill
  可以按本机依赖继续运行，但不能因此获得企业配置或权限。

## 5. Desktop 状态语义

Desktop 禁止继续使用不带条件的“正在使用缓存配置”。必须区分：

1. `企业在线：能力正常`；
2. `企业服务暂时不可用：当前已 Runtime Active 且完全本地可运行的能力可继续`；
3. `企业会话失效：企业能力暂停`；
4. `企业恢复：发现新配置，等待应用`。

可以同时显示最近成功同步时间、当前 Storage Active Revision 和是否等待
Runtime Activation，但不得向 Renderer 暴露 Token、Credential、Runtime Handle
或底层数据库记录。

## 6. MVP 非目标

本修订与 CGF-1.3 均不实现：

- 配置过期策略；
- 离线租约；
- 受限模式；
- 实时撤销；
- Policy Engine；
- 自动个人 Model fallback；
- 自动 Binding 切换；
- 自动破坏性 GC；
- 复杂 RBAC；
- 纯本地个人模式产品开关。

## 7. 关闭映射

| 修订项 | 关闭方式 |
| --- | --- |
| P1：状态 4 恢复触发与用户确认 | 冻结 Core 自动检测、Desktop 明示确认、禁止静默同步/激活/重启 |
| P1：完全本地可运行定义 | 冻结五项交集并规定事实只能来自 `enterprise-configuration.sqlite` |
| P1：旧 generation 回退 checklist | 由 CGF-1.3 计划冻结完整逐项条件和失败关闭 |
| P1：双 SQLite 恢复语义 | 由 CGF-1.3 计划冻结权威库、引用库和确定恢复顺序 |
| P2：Desktop 企业离线展示 | 冻结四种明确用户状态，删除模糊缓存文案 |
| P2：MVP 非目标 | 继续冻结九类范围，不借离线语义扩张平台能力 |

本修订项已经同步进入 MVP 正式基线和 CGF-1.3 开发计划，状态转为
`ACCEPTED / CLOSED`。该关闭不构成 CGF-1.3A 编码授权。
