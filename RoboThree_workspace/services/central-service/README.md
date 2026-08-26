# RoboThree Central Service

Java 模块化 Central Service 工程。当前 Central 开发版本为
`0.0.0-cgf.2a.3-SNAPSHOT`；CGF-2A.2 Application Runtime 已通过独立 QA
并由用户接受关闭，CGF-2A.3 真实双 JVM 恢复矩阵已通过独立 QA 并由用户
接受关闭，CGF-2A 整体 `PASS/CLOSED`。CGF-2B、CGF-2C 继续 `GATED`。

当前只包含：

- Java 21 / Spring Boot 3.x / Maven 可复现构建；
- `bootstrap`、`authentication`、`compatibility`、`configuration`、`credentials`、`modelgateway`、`toolgateway`、`audit`、`persistence` 包边界；
- 明确标记为 Fixture-only 的 readiness/compatibility Harness；
- Fake Secret Store、Fake Model、Fake Tool；
- TypeScript/Java 共用的非正式 Conformance Fixture。
- 从根级 `contracts/enterprise-gateway/v1alpha1/` 注入测试资源的正式
  Schema/Fixture Conformance consumer。
- PostgreSQL 16 / 版本化 SQL manifest、schema preflight 和显式事务；
- Identity、Device、Challenge、Token、Configuration、Package 的类型化
  Repository Port，以及 InMemory/JDBC Adapter Conformance。
- Fake OA 到短期 Verified Identity 的应用链；
- 单次 Device Challenge、`ROBOTHREE_DEVICE_PROOF_V1`/ES256 验证、
  Managed Device Trust 与可选 Manual Enrollment；
- `/v1alpha1/device-challenges` 和 `/v1alpha1/device-enrollment` 正式 Route，
  strict JSON、统一错误 Envelope 和 `no-store`；
- Challenge/Enrollment 原子消费、同 digest 幂等、不同 digest replay conflict
  以及真实 PostgreSQL 重启恢复验证。
- 四因素 `RoboThreeAccessTokenService`、事务内 revision 重检、Token 摘要持久化
  和标准 compact JWS Codec Port/Test Fake；
- 冻结 Compatibility evaluator、固定 Permission 以及 issuer/audience/expiry/
  signature/issuance-fact Token 校验；
- `/v1alpha1/compatibility`、`/v1alpha1/token` 和受 Bearer Token +
  `configuration.read` 保护的 `/v1alpha1/configuration`；
- canonical JSON、Snapshot/Package digest、文件内容 digest、Package 引用完整性、
  稳定 ETag 与 bodyless 304。
- Model Invocation Application Runtime、精确版本 Binding Resolver、
  Development Fake Provider、durable/ephemeral 分流、cancel/timeout、
  数据库时间 recovery lease、fencing epoch 和 evidence-based recovery。
- test-only 的真实双 JVM Model Recovery Harness：独立 PID、端口和连接池，
  共享 PostgreSQL，覆盖 crash takeover、stale fencing、durable SSE
  reconnect、取消竞争、数据库中断、Schema 漂移和资源收敛。

当前不包含真实 Model Provider Adapter、Model Invocation HTTP/SSE
Controller、Desktop 用户内容外发、真实
OA/MDM/证书、生产 JWS Codec/Secret Adapter 或生产操作系统 Device Signer。

## 验证

工程根目录的 `.java-version` 声明 Java 21。工具链发现顺序是：

1. 显式 `JAVA_HOME`；
2. macOS 标准 `/usr/libexec/java_home`；
3. `PATH` 中可解析到同一 JDK 的 `java`/`javac`。

不会读取或硬编码某位开发者的本机目录。

从产品工程根目录：

```bash
pnpm run check:java
pnpm run check:central
pnpm run check:central:offline
```

也可直接在本目录运行：

```bash
JAVA_HOME=/path/to/jdk-21 ./mvnw verify
```

Fixture 服务默认只绑定 `127.0.0.1` 和随机端口，不构成正式 Enterprise Gateway Contract 实现。
