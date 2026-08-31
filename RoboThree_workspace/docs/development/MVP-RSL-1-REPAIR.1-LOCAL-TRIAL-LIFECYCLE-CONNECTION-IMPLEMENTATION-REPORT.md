# MVP-RSL-1 repair.1 — Local-Trial Agent Lifecycle Connection Implementation Report

## 1. Outcome

RSL-1 repair.1 connects the existing Robot Lifecycle product path to the real Central service used by the
test/internal-trial Desktop entry. It does not add another lifecycle runtime and does not replace Central facts
with Renderer state.

The verified product path is:

1. enter the explicit local-demo session;
2. check the real lifecycle service before enabling draft mutations;
3. create a draft and persist revision 1 in Central PostgreSQL;
4. modify and persist revision 2;
5. run the existing real Task pipeline and refresh the durable test result;
6. submit the tested revision;
7. approve the immutable submission through the existing Admin review endpoint;
8. refresh the Desktop Catalog;
9. select the published Robot in Workbench, run a real model task, kill Core, and recover the exact Agent lock.

Developer outcome: `MVP_RSL1_REPAIR1_LOCAL_TRIAL_LIFECYCLE_CONNECTED`.

## 2. Implemented changes

### 2.1 Local-trial Central composition

The existing internal-trial Central/Electron entry now adds the existing lifecycle controllers, application
service, MyBatis store, PostgreSQL schema v12 and bearer-token authorizer to the same local Central process as
the Model Gateway. The lifecycle configuration is registered only by the explicit test/internal-trial entry;
the production composition is unchanged.

The lifecycle token is a short-lived HS256 lease with exact audience `enterprise-agent-lifecycle` and exact
permission `agent.manage`. The existing Main supervisor consumes the environment value once, deletes it, keeps
only a private `Buffer` for Core restart, and zeroes the Buffer on stop. The token does not enter Renderer,
Preload API, SQLite, logs, QA output or artifacts.

### 2.2 Renderer availability and reconnect behavior

The Robot creation page probes the real lifecycle adapter on mount. Until the probe succeeds, draft mutation
controls remain fail-closed. A failed probe shows `机器人生命周期服务不可用`, states that local fake data is
not used, and exposes `重新连接`, which retries the same real adapter.

The Intelligence Center applies the same behavior to `我创建的` drafts: loading, unavailable and reconnect
states come from real lifecycle requests. No Fake adapter, LocalStorage record or optimistic success state was
added.

### 2.3 Real Electron driver alignment

The RSL joint driver now follows the current product interaction rather than historical assumptions:

- it enters through the real local-demo login guard;
- it uses in-app routing so the intentionally memory-only demo session is not lost by a full Renderer reload;
- it waits for the lifecycle availability probe before saving;
- it provides the current required introduction and behavior fields;
- it obtains the test Task from the durable Central `testFact.taskId`;
- it clicks `刷新状态` before submission instead of fabricating a passed state.

The existing submission-identity gap remains open: the UI does not guess a `submissionId`, and withdraw remains
disabled until an authoritative identity is available.

## 3. Verification

Environment: Node `24.13.0`, pnpm `11.11.0`, JDK `21.0.12.1`.

- Desktop focused: `4 files / 24 tests PASS`.
- Desktop TypeScript project build: PASS.
- Desktop Renderer production build: PASS.
- DTP-4 packaging audit: PASS.
- `git diff --check`: PASS.
- Local-trial Central composition test with embedded PostgreSQL and real lifecycle HTTP: PASS.
- Real Central + Electron joint E2E: `1 test / PASS`, producing
  `MVP_RSL1_ROBOT_LIFECYCLE_E2E_CONFORMANT` with real Electron Main, Renderer, Main IPC, Core child, SQLite
  reopen, Gateway HTTP/SSE, Central lifecycle HTTP and Admin review HTTP; two draft revisions, completed draft
  test, approved immutable submission, published Robot Task, exact Agent lock and post-SIGKILL recovery all true.

## 4. Frozen boundaries

- no public Contract change;
- no Core or Central migration change (Core remains 26; Central remains schema 12);
- no dependency or lockfile change;
- no production identity/SSO/RBAC change;
- no second lifecycle state machine;
- no Renderer secret exposure or persistence;
- submission identity P1 remains separate and unresolved;
- Skill Lifecycle, TGM, Knowledge Provider, Personal Model and other downstream capabilities remain gated.

Root/Desktop version: `0.0.0-mvp.rsl.1-repair.1`. Core remains
`0.0.0-mvp.workspace.1`; Contracts/Admin remain `0.0.0-mvp.rsl.1`.

## 5. QA status

`PASS/CLOSED — INDEPENDENT_QA_PASS / USER ACCEPTED`.

Claude Code independently reran the real Model + Lifecycle Central composition and the real Central + Electron
RSL E2E under Node `24.13.0` and JDK 21; both completed with zero failures. The non-blocking workspace-wide
gate observation remains external to this batch. The submission-identity P1 remains open and separate.

Independent QA reran both the real local-trial Central composition and the real Central + Electron RSL flow;
a fixture-only or Renderer-only result was not used for closure. The commands remain below for reproducibility.

Recommended independent commands from the workspace root:

```bash
./node_modules/.bin/vitest run \
  apps/desktop/tests/intelligence-creation-page.test.ts \
  apps/desktop/tests/intelligence-center-page.test.ts \
  apps/desktop/tests/agent-lifecycle-adapter.test.ts \
  apps/desktop/tests/core-private-supervisor-lifecycle.test.ts \
  --maxWorkers=1

./node_modules/.bin/tsc -b apps/desktop
(cd apps/desktop && node ../../node_modules/vite/bin/vite.js build --config vite.preload.config.mjs)
(cd apps/desktop && CI=true VITE_ROBOTHREE_RUNTIME_MODE=local_demo \
  node ../../node_modules/vite/bin/vite.js build)

cd services/central-service
env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./mvnw \
  -Dtest=com.robothree.central.modelgateway.development.MvpVs1RealProviderDesktopE2E#startsTheLocalTrialModelAndAgentLifecycleCompositionTogether \
  test
env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ROBOTHREE_RSL1_RUN_E2E=true \
  ./mvnw -Dtest=com.robothree.central.agentlifecycle.MvpRsl1RobotLifecycleDesktopE2E test
```

The QA shell must use Node `24.13.0`, JDK 21 and must not leave `ELECTRON_RUN_AS_NODE=1` active.
