# WFW-1 Private Workspace Text Writer Implementation Report

> Version: `@robothree/document-worker 0.0.0-wfw.1`  
> Date: 2026-08-31  
> Status: `INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED`

## 1. Outcome

WFW-1 implements the private filesystem writer required by WFW Revision 1.1.
The exact private capability is `tool.workspace.file.write_text`. It is accepted
only by the Document Worker private v1alpha2 protocol and is not registered in
the Core Tool Registry.

This batch therefore provides trusted write mechanics, not an Agent-visible
product feature. WFW-2 must still add Core authority, Policy,
EffectCoordinator, durable postcondition recovery, and Artifact registration.
WFW-3 must still close Desktop presentation and real Electron/Windows E2E.

## 2. Implemented Behavior

- strict UTF-8 text encoding with no BOM or newline normalization;
- `create_new` with same-parent temporary file, file fsync, and atomic
  no-clobber publication;
- `replace_existing` with exact prior SHA-256, private owned-Artifact proof,
  same-parent temporary files, advisory lock, final digest recheck, atomic
  target publication, and one exact sibling `.prev` backup;
- private request digest over capability, idempotency key, WorkspaceGrant,
  normalized path, mode, content digest, replacement authority, and limits
  revision;
- postcondition inspection returning `not_found`, `safe_retry`,
  `recovered_success`, or `unknown`;
- four testable WFW v1 fault points: before temp creation, after temp fsync
  before publication, after target publication before Observation, and
  replacement-evidence ambiguity.

## 3. Security Boundaries

- existing parent directories only;
- no absolute, Windows-drive, UNC, URL, traversal, hidden, or `.prev` target;
- every existing parent must be a real non-symlink directory under the exact
  real Workspace root;
- replacement target and backup must be regular single-link files;
- maximum content is 256 KiB and remains bounded by invocation limits;
- NUL and unpaired UTF-16 surrogate input is rejected;
- errors contain no content or real Workspace path;
- no network, subprocess, shell, dependency, public Contract, migration, or
  lockfile change;
- external-editor writes in the final digest-check/rename window remain the
  documented best-effort residual risk and are not overclaimed as full CAS.

## 4. Verification

```text
Node v24.13.0
pnpm 11.11.0

WFW focused:                 3 files / 72 tests PASS
Document Worker full:       26 files / 220 tests PASS
Document Worker build:      PASS
Core build:                 PASS
Focused ESLint:             PASS
DTP-4 packaging audit:      PASS
DTP-4 audit self-test:      1 file / 2 tests PASS
git diff --check:           PASS
pnpm-lock.yaml SHA-256:     5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
```

Focused coverage includes exact UTF-8 bytes, content/path limits, parent
authority, create no-clobber races, replacement digest and ownership proof,
`.prev`, symlink/hard-link rejection, dead/live lock behavior, request-digest
verification, the four crash windows, postcondition decisions, cancellation,
private protocol routing, and zero Core/Main/Renderer activation.

## 5. Honest Remaining Work

- WFW-2: Core Registry, TaskCapabilityLock, Policy, exact Action approval,
  EffectCoordinator recovery, and durable Artifact registration;
- WFW-3: existing Artifact UI/APV projection, real Electron E2E, restart
  closure, and the required real Windows local-NTFS smoke;
- WFW-H1: parent creation, directory fsync/power-loss claims, stronger
  cross-process locking/CAS, and the extended filesystem matrix.

No later batch is automatically authorized by this report.

## 6. Closure

Claude Code 独立聚焦 QA 结论为 `CODE_QA_PASS — USER_ACCEPTANCE_PENDING`，P0/P1/P2 = 0，P3 = 1（Desktop workspace 全量门禁外部 blocker，与 WFW-1 零关联）。用户已于 2026-08-31 正式接受并关闭 WFW-1；P3 继续作为非阻断历史欠账保留，不建立 WFW repair。WFW-2、WFW-3 与 WFW-H1 未自动解锁。
