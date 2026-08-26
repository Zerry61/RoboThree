# Central Test Reliability Tracker

本文件只跟踪 Central 测试基础设施的非阻塞可靠性问题，不作为产品缺陷、阶段需求或编码授权。
问题关闭必须追加证据，不得通过降低生产不变量、删除测试或无界自动重试实现。

## CTR-P3-001：双节点 Recovery 与 PostgreSQL Lease 测试偶发时序竞争

| 属性 | 内容 |
| --- | --- |
| 首次登记 | 2026-08-14，ARH-3.2.3 Claude Code 独立 QA |
| 等级 | P3 / Test Reliability / Non-Product-Defect |
| 状态 | OPEN / NON-BLOCKING |
| 影响范围 | `check:central` online 完整套件的偶发红灯；不影响生产语义 |
| 不属于 | ARH-3.2.3 产品缺陷、ARH-3.3 自动范围、功能需求 |

### 现象与当前证据

- `Cgf2a3DualNodeModelRecoveryIntegrationTest` 偶发未在既定窗口进入 blocking execution；
- `PostgreSqlMyBatisPersistenceIntegrationTest` 偶发触发 `ck_model_invocation_lease_time`；
- 两项独立复跑分别 **2/2**、**11/11 PASS**；
- Claude Code Central offline 完整套件 **297/0/0/0 PASS**；
- Codex 5.6 Central online/offline 完整套件均 **297/0/0/0 PASS**；
- 当前证据指向 Testcontainers PostgreSQL、双节点调度与 lease 时间窗口竞争，不构成
  ARH-3.2.3 回归。

### 后续维护边界

允许在独立维护批次中：

1. 增加确定性 barrier、受控数据库时间或更精确的进程就绪信号；
2. 隔离共享测试资源和报告目录；
3. 增强提前退出、约束失败与时序诊断；
4. 通过多轮完整门禁证明稳定性。

禁止：

- 修改生产 lease/fencing/事务语义来迁就测试；
- 使用无界 retry 隐藏真实失败；
- 将本问题静默并入 ARH-3.3；
- 仅凭单项复跑直接标记关闭。

### 建议关闭条件

- 两个命名测试各连续复跑至少 10 次；
- Central online 完整套件连续至少 3 次全绿；
- Central offline 完整套件至少 1 次全绿；
- 无生产代码、Contract、Schema 或 migration 语义退化；
- 独立 QA 确认后追加关闭记录。
