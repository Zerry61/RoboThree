# ADR-009：企业服务端 Java 与本地 Agent Node.js 技术边界

> 状态：**ACCEPTED**  
> 提出日期：2026-07-21  
> 接受日期：2026-07-21  
> 一致性修订：2026-07-24，跨语言协议方向与两层配置激活边界  
> 适用范围：未来企业控制面、Admin API 与本地 Agent Runtime 的语言边界

## 1. 背景

ADR-004 已冻结 Kernel Alpha 使用 TypeScript、Electron/Vue、Node.js Local Core 与 SQLite，但当时明确没有决定未来企业中央服务的技术栈。

公司现有服务端项目以 Java 为主。未来 RoboThree 建设企业管理后台时，身份、组织、配置、策略、审计、共享 Registry 和管理接口需要融入现有研发、基础设施、部署与运维体系。同时，本地 Agent Runtime 具有流式模型调用、事件驱动编排、MCP 和桌面集成需求，Node.js 仍适合该运行边界。

## 2. 决策

RoboThree 采用明确的双运行时边界：

```text
Admin Console Web UI
        ↓
Java Admin API / Central Enterprise Service
        ↓ versioned language-neutral contracts
Node.js Local Agent Core
        ↓
Worker / Tool / MCP / Remote Capability
```

1. 未来企业服务端采用 Java，包括 Central Enterprise Service 和面向 Admin Console 的 Admin API；
2. 本地 Agent Runtime / Local Core 保持 Node.js，不因企业服务端采用 Java 而重写；
3. Admin Console 是 Web 管理入口，其前端技术栈不由本 ADR 决定；“管理后台采用 Java”特指服务端与 Admin API；
4. Java 企业服务与 Node.js Local Core 独立构建、部署和扩缩容，不互相导入源码，也不共享进程内对象；
5. 跨语言边界必须使用版本化、语言无关的 Contract。Desktop/Central Foundation 的协议方向采用 OpenAPI 3.1、JSON Schema、HTTPS/JSON 与 SSE；两份 Contract 在明确接受前保持 `PROPOSED`，不得据此生成正式业务 DTO；
6. 跨边界 Contract 必须明确认证、授权、错误、幂等、兼容性、超时和审计语义，不能只依赖 Java DTO 或 TypeScript 类型；
7. Python、C# 或其他语言仍可根据能力生态运行在 Worker、Tool、MCP Server 或远程服务中，不改变 Core 与企业控制面的主语言边界。

### 2.1 企业配置跨语言同步边界

Java Central Service 负责提供完整、版本化的 Configuration Snapshot 和不可变 Agent/Skill Package；Node.js Local Core 负责候选校验、依赖物化、本地 Storage Activation 和后续 Runtime Registry Activation。

```text
Java Central Service
→ complete Configuration Snapshot + immutable package references/content
→ Node Local configuration candidate
→ MaterializedEnterpriseConfiguration
→ Configuration Storage Activation
→ pending_runtime_activation
→ controlled Local Core restart
→ new immutable RegistrySnapshot
```

`MaterializedEnterpriseConfiguration` 至少包括：

- Configuration Snapshot；
- 已下载并校验的 Agent Packages；
- 已下载并校验的 Skill Packages；
- Model、Tool、Knowledge Descriptors；
- 用户固定权限；
- 全部 revision/digest；
- Desktop/Core/Contract 兼容信息。

它是本地离线可读配置的完整技术激活单位，不是新的产品模块，也不是 Capability Registry。Agent 和 Skill 继续是独立产品对象；Capability Registry 继续只管理 Model 和 Tool。

只有 Schema、Snapshot digest、Package digest、引用完整性、全部强依赖物化、Package revision 和客户端/Core 兼容性全部通过，候选配置才能成为本地最近成功配置。

Configuration Storage Activation 不代表当前 Runtime Registry 已切换。当前 Task 继续使用已锁定 TaskCapabilityLock；新配置只能在 Local Core 受控重启或 ADR-008 明确允许的 rebuild 后生成新 RegistrySnapshot，并供新 Task 使用。

Central Service 不接管本地 Agent Loop、Runtime Selection、Workspace、Session/Task、Desktop 用户确认或个人 Model Credential。

## 3. 理由

- 复用公司既有 Java 服务端人才、工程规范、基础设施和运维能力；
- 避免为了语言统一而重写已验证的 Node.js Agent Kernel；
- 让企业控制面与本地执行面保持清晰的部署和安全边界；
- 用语言无关 Contract 管理演进，避免形成 Java 与 TypeScript 的源码级耦合；
- 保留 Worker 与外部能力按生态选择合适语言的空间。

## 4. 明确不决定

本 ADR 不提前决定：

- Java 版本、Spring Boot 或其他具体框架；
- Maven/Gradle、数据库、消息中间件和部署平台；
- Admin Console 前端框架；
- 企业服务是否拆成多个微服务；
- Java 服务在 Monorepo 中的最终目录；
- 企业服务与 Local Core 的具体协议和同步拓扑。

这些选择必须等管理后台进入真实规划、接口和部署约束明确后再形成开发计划或替代 ADR。

## 5. 后果

正面后果：

- 企业服务与公司现有技术体系一致；
- Agent Core 可以继续发挥 Node.js 在流式、事件与 MCP 集成上的优势；
- 两侧可以独立演进、测试和部署；
- 跨语言 Contract 会成为显式且可验证的产品边界。

代价与风险：

- Java 与 Node.js 双栈增加 Contract、序列化和端到端测试成本；
- `packages/contracts` 不能作为企业接口的唯一真相来源，需要可生成或可验证的语言无关 Schema；
- 分布式调用会引入版本兼容、网络失败、重试与审计问题；
- 团队必须避免在 Java 企业服务中复制 Agent 编排逻辑，也避免在 Node.js Local Core 中建设企业管理后台业务。

## 6. 与现有决策的关系

- 本 ADR 补充 ADR-001 的 Local Core / Central Enterprise Service 部署边界；
- 本 ADR 补充 ADR-004 尚未决定的企业中央服务技术栈，不替代其 Kernel Alpha 技术选择；
- 本 ADR 的 2026-07-24 修订补充 ADR-008 的冻结 Registry 约束：企业配置的 Storage Activation 与 Runtime Registry Activation 必须分离；
- Desktop/Central Foundation 的具体接口语义继续由 `PROPOSED` Enterprise Gateway Contract 定义；该 Contract 未冻结前只允许非语义脚手架；
- 当前 KAF-3.2、KAF-3.3 和 Kernel Alpha 范围不因本 ADR 扩张，Java 企业服务仍在真实管理后台阶段再建立工程目录。

若未来改变企业服务端或本地 Agent Core 的主语言，必须建立新的替代 ADR，不得在实现中静默改变。
