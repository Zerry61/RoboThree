# APV Source Delete / Deletion Record Development Plan

> Owner: Codex 5.6
> Status: APV-3.0 PASS/CLOSED; APV-3A PASS/CLOSED; APV-3B PASS/CLOSED; APV-3C PASS/CLOSED (DOCS-ONLY)
> Date: 2026-08-06

## 1. Current Gate

```text
DTP-0 -> DTP-4: PASS/CLOSED
DWE-0 -> DWE-3: PASS/CLOSED
APV-0 -> APV-2: PASS/CLOSED

APV-3.0: PASS/CLOSED
APV-3A: PASS/CLOSED
APV-3B: PASS/CLOSED
APV-3C: PASS/CLOSED (DOCS-ONLY)

manual artifact registration: GATED
overwrite / bulk overwrite: GATED
OS Sandbox: GATED
formal installer: GATED
```

APV-3 extends the Desktop/Application artifact lifecycle. It is not a
model-callable Tool and does not register `artifact.preview`, `artifact.delete`,
or any other Artifact Tool.

## 2. Product Decision

APV-3 separates two operations that must not be mixed:

1. Artifact record deletion:
   hides or tombstones a Desktop artifact fact in RoboThree state only. It never
   deletes, modifies, renames, or moves a workspace file.
2. Source file deletion:
   removes the workspace file referenced by an artifact. This is a destructive
   file operation and requires a separate confirmation, active WorkspaceGrant,
   realpath containment, and recovery semantics.

P0 will not implement permanent filesystem unlink. If source file deletion is
authorized later, the first implementation should move the file to the operating
system Trash/Recycle Bin through the Desktop Main process. If that platform
operation is unavailable or cannot be confirmed, APV must fail closed instead of
falling back to `unlink`.

## 3. Scope Freeze

Allowed across APV-3:

- delete or restore an Artifact record from the Desktop artifact list;
- store an auditable artifact deletion record that preserves artifact identity,
  source digest, actor-free local command metadata, and timestamps;
- optionally move a source file to OS Trash in a later batch after explicit user
  confirmation;
- reuse APV-2 private `artifactId -> durable fact -> active WorkspaceGrant ->
  rootRealPath + relativePath` authority resolution;
- keep Renderer command payloads limited to `artifactId`, expected revision, and
  confirmation fields.

Forbidden across APV-3:

- model-visible Artifact delete Tool registration;
- Document Worker changes;
- source file overwrite, rename, move, patch, append, bulk operation, or direct
  permanent unlink in P0;
- deleting files whose durable artifact fact has no active WorkspaceGrant;
- deleting directories, symlinks, hard-linked targets without explicit handling,
  hidden dotfiles by path trick, or paths outside WorkspaceGrant realpath
  containment;
- accepting absolute paths, `rootRealPath`, `workspaceRoot`, `relativePath`,
  `targetPath`, `filePath`, workbook content, HTML, or session identity from
  Renderer;
- preview server, Markdown/HTML sanitizer, parser, writer, OS Sandbox, formal
  installer, or overwrite confirmation work.

## 4. Terminology

Artifact identity remains:

```text
artifactId
taskId
sourceKind
sourceId
sourceDigest
createdAt
```

Deletion state is not identity. A deleted Artifact keeps the same identity and
is represented by an overlay record.

Record deletion means:

```text
artifact remains in durable audit/history;
normal Artifact Panel omits it unless "show deleted" is enabled;
source file remains untouched;
restore can clear the deletion overlay if the source fact is still valid.
```

Source file deletion means:

```text
source file is moved to OS Trash/Recycle Bin by Desktop Main;
Artifact record is marked sourceDeleted after confirmed Main result;
Artifact identity and audit record remain durable;
preview/open/export become unavailable with a typed missing/deleted state.
```

## 5. Proposed Desktop Contract Additions

APV-3A may add to Desktop Local `v1alpha1`:

```ts
ArtifactLifecycleProjection {
  pinned: boolean
  dismissed: boolean
  deleted?: boolean
  updatedAt?: Timestamp
  pinnedAt?: Timestamp
  dismissedAt?: Timestamp
  deletedAt?: Timestamp
  deletionReasonSummary?: string
}

DeleteArtifactRecordCommand {
  type: "delete_artifact_record"
  artifactId: ArtifactId
  expectedArtifactRevision: number
  reasonSummary?: string
}

RestoreArtifactRecordCommand {
  type: "restore_artifact_record"
  artifactId: ArtifactId
  expectedArtifactRevision: number
}

ArtifactRecordDeletionReceipt {
  commandId: UUID
  artifactId: ArtifactId
  status: "accepted" | "replayed"
  lifecycle: ArtifactLifecycleProjection
}
```

APV-3B may add:

```ts
DeleteArtifactSourceFileCommand {
  type: "delete_artifact_source_file"
  artifactId: ArtifactId
  expectedArtifactRevision: number
  confirmationText: string
}

ArtifactSourceFileDeletionReceipt {
  commandId: UUID
  artifactId: ArtifactId
  status: "accepted" | "replayed"
  sourceFileDeleted: boolean
  deletionMode: "os_trash"
  lifecycle: ArtifactLifecycleProjection
}
```

All schemas must be `.strict()` and reject:

```text
workspaceRoot
rootRealPath
relativePath
targetPath
filePath
workbook
html
sessionId
schemaVersion
tool arguments
```

## 6. Confirmation Semantics

APV-3A record deletion:

- may use a lightweight confirmation because it does not touch source files;
- confirmation copy must say the underlying file is not deleted;
- no absolute path may be displayed or returned.

APV-3B source file deletion:

- must require explicit confirmation text derived from the safe display name,
  for example `DELETE report.xlsx`;
- the UI may show safe `displayName`, safe workspace-relative path, file size,
  artifact kind, and source task summary;
- the UI must not show absolute workspace root;
- confirmation must be checked in Main/Core path before file action;
- stale revision, missing source, revoked grant, or changed realpath identity
  must fail closed.

## 7. Authority And Ownership

Renderer:

- sends only `artifactId`, expected revision, and confirmation fields;
- never sends path or workspace authority;
- never calls file APIs.

Core:

- owns durable Artifact fact lookup, lifecycle record storage, command replay,
  and active WorkspaceGrant lookup;
- may return private source authority only to Desktop Main through the existing
  private HTTP boundary;
- must not expose `rootRealPath` in public projection, model context,
  Observation, Event, logs, or Renderer IPC receipts.

Desktop Main:

- owns all filesystem effects;
- revalidates safe relative path, root realpath, target realpath containment,
  `lstat`/`stat` identity, and file type immediately before source deletion;
- calls OS Trash/Recycle Bin API only after Core authorization and explicit
  confirmation;
- returns path-free receipts.

## 8. Record Persistence

APV-3A should extend the existing `artifact_lifecycle_records` table instead of
creating a second state store, unless review finds a blocker.

Candidate migration:

```text
artifact_lifecycle_records
  artifact_id
  task_id
  source_digest
  pinned
  dismissed
  deleted
  source_deleted
  updated_at
  record_json
```

The record must support idempotent command replay:

- same commandId + same request digest -> replay;
- same commandId + different request digest -> conflict;
- different commandId against stale expected revision -> conflict;
- sourceDigest drift -> fail closed;
- deleted record can be restored only by record restore command, not by a new
  projection rebuild.

## 9. Source File Delete Flow

APV-3B intended flow:

```text
Renderer command by artifactId + expected revision + confirmation text
-> Main validates command schema
-> Core resolves durable artifact fact and active WorkspaceGrant
-> Core verifies confirmation and lifecycle preconditions
-> Main receives private rootRealPath + relativePath + expected source digest/facts
-> Main realpath/lstat/stat validates containment and regular file
-> Main performs OS Trash move
-> Main verifies source no longer exists at same realpath
-> Core commits sourceDeleted lifecycle overlay
-> Renderer receives path-free receipt
```

If Main succeeds but Core commit fails, recovery must converge by rechecking the
source path and recording `sourceDeleted` only when the postcondition is
verifiable. If the postcondition is not verifiable, Core returns
`manual_attention`/typed uncertainty rather than retrying a destructive action.

## 10. Typed Errors

APV-3 should reuse existing Desktop error envelope shape. Candidate codes:

```text
desktop.artifact_not_found
desktop.artifact_revision_conflict
desktop.artifact_already_deleted
desktop.artifact_restore_unavailable
desktop.workspace_unavailable
desktop.artifact_source_unavailable
desktop.artifact_source_changed
desktop.artifact_delete_confirmation_required
desktop.artifact_delete_confirmation_mismatch
desktop.artifact_delete_unsupported
desktop.artifact_delete_failed
desktop.artifact_delete_uncertain
desktop.contract_invalid
```

If the existing code vocabulary cannot support these without introducing
ambiguous public semantics, APV-3 implementation must stop and request a
Contract review instead of inventing loosely mapped errors.

## 11. Security Matrix

APV-3A must prove:

- record deletion never touches source files;
- record deletion hides artifact in normal panel but keeps audit/history;
- restore reappears with the same `artifactId`;
- deleted artifacts cannot be opened, exported, or previewed unless restored;
- stale expected revision fails closed;
- lifecycle command replay is deterministic;
- Renderer payload contains no path or workspace authority.

APV-3B must additionally prove:

- source delete requires active WorkspaceGrant and explicit confirmation text;
- Renderer cannot provide absolute path, relative path, root path, or target;
- Main rejects symlink escape, traversal, null byte, UNC, Windows drive, root,
  directory, socket, FIFO, and missing files;
- Main rejects source identity drift between resolve and delete;
- OS Trash unavailable returns unsupported/failed and does not call unlink;
- crash before/after Trash call and before/after Core commit converges without
  repeating a destructive delete blindly;
- sourceDeleted artifacts cannot open/export/preview and show a stable deleted
  state;
- no `artifact.preview` Tool, no Artifact delete Tool, no Document Worker or
  Central changes.

## 12. Allowed Modification Scope

APV-3.0 plan only:

```text
docs/development/apv/**
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

APV-3A implementation, if later authorized:

```text
packages/contracts/src/desktop-local/v1alpha1/**
packages/contracts/tests/**
services/core/src/application/**
services/core/src/adapters/http/**
services/core/src/adapters/memory/**
services/core/src/adapters/sqlite/**
services/core/src/ports/**
services/core/tests/**
apps/desktop/src/shared/**
apps/desktop/src/preload/**
apps/desktop/src/main/**
apps/desktop/src/renderer/**
apps/desktop/tests/**
packages/contracts/package.json
services/core/package.json
apps/desktop/package.json
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
```

APV-3A forbidden:

```text
services/document-worker/**
services/central-service/**
Tool Registry / model-visible tools
pnpm-lock.yaml
root package.json
root tsconfig.json
source file delete
manual artifact registration
overwrite / OS Sandbox / formal installer
```

APV-3B implementation must be separately authorized after APV-3A QA.

## 13. Work Breakdown

APV-3.0: Contract and security freeze

- finalize record deletion vs source deletion semantics;
- approve confirmation copy and typed errors;
- approve persistence and recovery shape;
- no production code.

Estimate: 0.5 to 1 concentrated engineering day.

APV-3A: Artifact record deletion

- extend lifecycle schema and projection;
- persist deleted/restored lifecycle overlay;
- UI hide/show deleted and restore;
- disable open/export/preview for deleted records;
- no filesystem deletion.

Estimate: 2 to 4 concentrated engineering days.

APV-3B: Source file delete to OS Trash

- explicit destructive confirmation;
- Main-only realpath/lstat/stat validation;
- OS Trash operation and recovery postcondition;
- no direct unlink fallback.

Estimate: 4 to 7 concentrated engineering days.

APV-3C: Independent hardening / UX polish, if needed

- deleted artifact filtering, audit surfaces, task-detail recovery copy, and
  additional platform smoke tests.
- detailed plan: `docs/development/apv/APV-3C-HARDENING-UX-POLISH-DEVELOPMENT-PLAN.md`.
- independent review closed APV-3C as docs-only because no P0-P3 production
  hardening driver exists.

Estimate: 1 to 3 concentrated engineering days.

Total APV-3 engineering estimate: 7.5 to 15 concentrated engineering days,
excluding independent QA, user review, and rework.

## 14. QA Gate

Every APV-3 implementation batch must pass:

```text
pnpm --config.verify-deps-before-run=false run build
pnpm --config.verify-deps-before-run=false exec vitest run <focused APV-3 tests>
pnpm --config.verify-deps-before-run=false exec vitest run packages/contracts/tests
pnpm --config.verify-deps-before-run=false exec vitest run services/core/tests
pnpm --config.verify-deps-before-run=false exec vitest run services/document-worker/tests
pnpm --config.verify-deps-before-run=false exec vitest run apps/desktop/tests
CI=true pnpm --config.verify-deps-before-run=false run lint
CI=true pnpm --config.verify-deps-before-run=false run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline --config.verify-deps-before-run=false
CI=true pnpm --config.verify-deps-before-run=false run check
```

Static scans must prove:

```text
Renderer/Preload: no workspaceRoot/rootRealPath/relativePath/targetPath/filePath/workbook
Tool Registry: no artifact delete or artifact.preview Tool
Document Worker/Central: no APV-3 implementation
lockfile/root config: unchanged unless separately authorized
```
