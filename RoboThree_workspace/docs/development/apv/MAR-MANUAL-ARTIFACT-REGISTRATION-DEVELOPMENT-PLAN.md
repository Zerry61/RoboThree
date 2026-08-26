# MAR Manual Artifact Registration Development Plan

> Owner: Codex 5.6
> Status: MAR-0 PASS/CLOSED; MAR-1.0 PASS/CLOSED; MAR-1A PASS/CLOSED; MAR-1B PASS/CLOSED; MAR series PASS/CLOSED
> Date: 2026-08-06

## 1. Current Gate

```text
DTP-0 -> DTP-4: PASS/CLOSED
DWE-0 -> DWE-3: PASS/CLOSED
APV-0 -> APV-3B: PASS/CLOSED
DWO-0 -> DWO-3: PASS/CLOSED
Document Tool stack: PASS/CLOSED

MAR-0: PASS/CLOSED
MAR-1.0: PASS/CLOSED
MAR-1A: PASS/CLOSED
MAR-1B: PASS/CLOSED
MAR series: PASS/CLOSED

APV-3C: PASS/CLOSED (DOCS-ONLY)
bulk overwrite: GATED
OS Sandbox: GATED
formal installer: GATED
CGF-2C.2 / CGF-2C.3: GATED / waiting for PRD and UX input
```

MAR is a Desktop/Application capability for registering an existing file inside
an already authorized Workspace as a RoboThree Artifact. It is not a Tool, does
not register a model-visible `artifact.*` capability, and does not call Document
Worker in P0.

MAR-1.0 selected the **global Artifact catalog projection** path. Manual
Artifacts are not inserted into Task Detail and do not receive synthetic
`taskId`; `sessionId` remains projection context only and is not part of
Artifact identity. P0 treats `sourceDigest` as content/file-fact identity
(`fileSha256`, byte size, media type, registration schema) and does not include
mtime, avoiding false conflicts from touch-only metadata changes. Hardlinks
remain rejected in MAR-1A Main-owned file guard. MAR-1B adds bounded
workspace-file preview for `.txt`, `.md`, `.markdown`, `.html`, and `.htm`;
HTML files render only through the APV-1C loopback sandbox.

## 2. Product Decision

Manual registration fills the gap left after DTP, DWE, APV, and DWO:

- Document Tools can create and read files.
- APV can preview and manage Artifacts produced by Tool observations.
- DWO can overwrite a workbook through an explicitly confirmed Tool action.
- Users still cannot add an existing workspace file to the Artifact panel unless
  a Tool first touches it.

P0 supports:

```text
User-selected existing workspace file
-> metadata-only Artifact registration
-> Artifact panel lifecycle actions from APV-2/APV-3
```

P0 does not parse, preview file contents, copy, import, modify, overwrite, move,
or delete the selected file.

## 3. Scope Freeze

Allowed in MAR P0:

- register exactly one existing regular file under an active WorkspaceGrant;
- use existing WorkspaceGrant authority and realpath containment;
- store a durable, path-safe Artifact registration record;
- surface the record in the Desktop Artifact panel with safe metadata only;
- enable existing APV lifecycle actions that already operate by `artifactId`;
- allow APV-2 open-location/export to resolve the registered file through Core
  private authority, if the file still exists and containment still holds;
- keep source file delete behavior governed by APV-3B, including its Trash-only
  postcondition and no permanent unlink fallback.

Forbidden in MAR P0:

- model-visible Tool registration;
- `artifact.preview` Tool or any new Tool Registry entry;
- Document Worker parser or writer calls;
- file content preview, text extraction, workbook parsing, thumbnailing, or
  HTML sandbox generation for workspace files;
- copying files into RoboThree storage;
- registering files outside the active WorkspaceGrant;
- accepting absolute paths, root paths, file paths, workspaceRoot, rootRealPath,
  FileHandle, fd, workbook content, HTML, or parser output from Renderer;
- drag-and-drop paths from Renderer unless a later batch proves an equivalent
  Main-owned authority path;
- registering directories, symlinks, sockets, FIFOs, devices, packages, hidden
  path tricks, Windows drive paths, UNC paths, null-byte paths, or traversal;
- bulk registration, glob registration, folder registration, and recursive
  import;
- overwrite, bulk overwrite, OS Sandbox, formal installer, and CGF changes.

## 4. Identity Model

Existing APV task artifacts are task-scoped and derived from successful Tool
observations:

```text
artifactId = sha256({ taskId, sourceKind, sourceId, sourceDigest })
sourceKind = "tool_observation"
```

Manual registration is not task-scoped. MAR-1 must not fake a user Task just to
satisfy the current Task Detail schema.

MAR-0 freezes this identity:

```text
sourceKind = "workspace_file"
sourceId = sha256({
  workspaceGrantId,
  relativePath,
  registrationKind: "manual_workspace_file"
})
sourceDigest = sha256({
  workspaceGrantId,
  relativePath,
  fileSha256,
  size,
  mtimeMsUtc,
  mediaType,
  registrationSchema
})
artifactId = sha256({
  sourceKind,
  sourceId,
  sourceDigest
})
```

`workspaceGrantId` is used in private identity material and durable Core
records. It must not be exposed to Renderer projection unless an existing
Desktop contract already exposes it for workspace selection state.

`sessionId` is not part of identity. It is projection context only.

`taskId` is not part of manual Artifact identity. MAR-1 must therefore either:

1. add a dedicated global Artifact catalog projection that does not require
   `taskId`, or
2. add an explicit `originTaskId?: DesktopResourceId` / `originKind` contract
   shape after Contract review.

If neither additive route can keep existing Task Detail compatibility, MAR-1
must stop and request Contract review before coding.

## 5. Desktop Contract Shape

MAR-1.0 may add Desktop Local `v1alpha1` contracts after review:

```ts
RegisterWorkspaceArtifactCommand {
  type: "register_workspace_artifact"
  commandId: UUID
  clientInstanceId: DesktopResourceId
}

RegisteredArtifactProjection {
  artifactId: ArtifactId
  sourceKind: "workspace_file"
  sourceId: string
  sourceDigest: Sha256Digest
  displayName: DesktopDisplayText
  kind: ArtifactKind
  mediaType: string
  relativePath?: DesktopSafeSummary
  byteSize?: number
  createdAt: Timestamp
  previewState: "unsupported" | "missing" | "blocked"
  lifecycle: ArtifactLifecycleProjection
  metadata: JsonObject
}

RegisterWorkspaceArtifactReceipt {
  commandId: UUID
  artifactId: ArtifactId
  status: "accepted" | "replayed"
  artifact: RegisteredArtifactProjection
}
```

The command intentionally carries no path. Desktop Main owns file selection and
sends private authority to Core over the existing private boundary.

All public schemas must be `.strict()` and reject:

```text
workspaceRoot
rootRealPath
absolutePath
relativePath
targetPath
filePath
workspaceGrantId
fileSha256
workbook
html
parserOutput
sessionId
schemaVersion
tool arguments
```

If MAR-1 decides a safe relative display path must appear in the public receipt,
that field must be Core-produced only and bounded by the existing relative path
guard.

## 6. Authority And Ownership

Renderer:

- initiates registration only by command id and UI intent;
- never sends path, workspace authority, file content, drag/drop path, or
  workspaceGrantId;
- receives only safe Artifact projection data.

Desktop Main:

- opens the native file picker from the active workspace root;
- may receive an absolute path from the operating system picker;
- resolves root and selected file with `realpath`;
- verifies same-device containment under the active WorkspaceGrant root;
- rejects symlink, non-regular file, hardlink count greater than one, null byte,
  traversal, UNC, Windows drive, root, and paths outside the grant;
- computes bounded metadata and a streaming SHA-256 file digest;
- sends private `{ workspaceGrantId, relativePath, file facts, fileSha256 }` to
  Core.

Core:

- owns WorkspaceGrant lookup, durable registration storage, idempotency,
  command replay, projection, and lifecycle integration;
- revalidates current WorkspaceGrant status before committing;
- never exposes `rootRealPath`, absolute path, or private file digest material
  in Renderer, model context, Task observation, Event, logs, or screenshots.

Document Worker:

- is not called in MAR-1.0 / MAR-1A;
- remains the only document parser/writer boundary for Tool-based document
  operations.

## 7. File Eligibility

P0 supported extensions:

```text
.pdf
.xlsx
.docx
.md
.markdown
.txt
.html
.htm
```

The extension only drives metadata and display kind. It must not imply content
preview or parser execution.

P0 rejects:

```text
missing file
directory
symlink
hardlink count > 1
socket / FIFO / device
file larger than maxRegisterBytes
unsupported extension
path outside WorkspaceGrant
relative path collision with an existing manual registration whose sourceDigest differs
```

Initial limits:

```text
maxRegisterBytes = 256 MiB
maxDisplayNameScalars = 160
maxRelativePathBytes = 1024
maxMetadataBytes = 4096
maxRegistrationsPerWorkspace = 1024
```

Large files are rejected before digest allocation beyond the streaming buffer.

## 8. Persistence

MAR-1.0 should add a new durable store instead of overloading
`artifact_lifecycle_records`:

```text
manual_artifact_registrations
  artifact_id TEXT PRIMARY KEY
  workspace_grant_id TEXT NOT NULL
  relative_path TEXT NOT NULL
  source_digest TEXT NOT NULL
  file_sha256 TEXT NOT NULL
  byte_size INTEGER NOT NULL
  media_type TEXT NOT NULL
  created_at TEXT NOT NULL
  record_json TEXT NOT NULL
```

Additional unique index:

```text
workspace_grant_id, relative_path
```

Replay rules:

- same commandId + same request digest -> replay accepted;
- same commandId + different request digest -> conflict;
- same relativePath + same sourceDigest -> return existing artifact;
- same relativePath + different sourceDigest -> `artifact.registration_conflict`;
- grant revoked before commit -> `desktop.workspace_unavailable`;
- file changed between Main validation and Core commit -> Core must require a
  fresh registration attempt if it can revalidate facts, otherwise fail closed.

## 9. Projection Semantics

MAR registered artifacts appear in a global Artifact panel/catalog, not in a
Task Detail artifact list, unless a later contract explicitly models manual
artifacts in Task views.

Current preview semantics after MAR-1B:

```text
text/markdown/html registered workspace files:
  previewState = "available"
  reason = "Manual text and HTML preview is available through Desktop Main."

other registered workspace files:
  previewState = "unsupported"
  reason = "Manual file preview is not supported for this file type."
```

Text and Markdown preview use bounded Desktop Main reads. HTML preview uses the
APV-1C 127.0.0.1-only sandbox and deny-by-default CSP. Registered PDF/XLSX/DOCX
files remain APV-only metadata unless a later approved design routes them
through Document Worker.

Open location and export:

- use APV-2 private `artifactId -> Core -> active WorkspaceGrant -> Desktop Main`
  authority flow;
- revalidate realpath containment and current file identity;
- fail closed if the file is missing, moved, replaced, or outside the grant.

Source delete:

- remains APV-3B behavior;
- registered files may be source-deleted only if APV-3B validations pass.

Record delete/restore:

- reuses APV-3A lifecycle overlay by `artifactId`;
- never touches the source file.

## 10. Typed Errors

Candidate error codes:

```text
desktop.artifact_registration_unavailable
desktop.artifact_registration_cancelled
desktop.artifact_registration_invalid
desktop.artifact_registration_conflict
desktop.artifact_registration_too_large
desktop.artifact_registration_unsupported_type
desktop.workspace_unavailable
desktop.artifact_source_unavailable
desktop.artifact_source_changed
desktop.contract_invalid
```

If existing Desktop error vocabulary cannot support these without ambiguous
mapping, MAR-1 must stop for Contract review.

## 11. Work Breakdown

MAR-0: Contract / security / UX freeze

- create this plan;
- freeze P0 scope, identity, authority, persistence, typed errors, and QA
  matrix;
- no production code.

Status: implemented as docs-only, pending review.

Estimate: 0.5 to 1 concentrated engineering day.

MAR-1.0: Contract and persistence foundation

- add additive Desktop Local schemas for manual Artifact registration;
- add Core port and memory/SQLite persistence;
- expose registration records to a global Artifact catalog projection;
- no file picker UI and no content preview.

Estimate: 3 to 5 concentrated engineering days.

MAR-1A: Desktop picker and metadata-only panel

- wire Renderer button to Main-owned file picker;
- implement Main guard and streaming digest;
- commit registration through Core;
- show registered artifact metadata in the Artifact panel;
- reuse APV lifecycle/open/export/delete controls where valid.

Estimate: 3 to 5 concentrated engineering days.

MAR-1B: Bounded workspace-file preview, optional later batch

- add bounded text/markdown preview for registered workspace files;
- HTML preview must reuse APV-1C sandbox and CSP;
- binary document preview/parsing remains gated unless routed through Document
  Worker under a separately approved design.

Estimate: 2 to 4 concentrated engineering days.

Total MAR estimate: 8.5 to 15 concentrated engineering days, excluding
independent QA, user review, and rework.

## 12. Allowed Modification Scope

MAR-0 docs only:

```text
docs/development/apv/**
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

MAR-1.0, if later authorized:

```text
packages/contracts/src/desktop-local/v1alpha1/**
packages/contracts/tests/**
services/core/src/application/**
services/core/src/adapters/http/**
services/core/src/adapters/memory/**
services/core/src/adapters/sqlite/**
services/core/src/ports/**
services/core/tests/**
packages/contracts/package.json
services/core/package.json
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
```

MAR-1A, if later authorized:

```text
apps/desktop/src/shared/**
apps/desktop/src/preload/**
apps/desktop/src/main/**
apps/desktop/src/renderer/**
apps/desktop/tests/**
apps/desktop/package.json
services/core/src/**
services/core/tests/**
services/core/package.json
```

Forbidden until separately authorized:

```text
Document Worker production changes
Tool Registry / model-visible Artifact Tool
artifact.preview Tool
file content parser integration
bulk registration
drag/drop path ingestion
overwrite / bulk overwrite
OS Sandbox
formal installer
pnpm-lock.yaml
root package.json
root tsconfig.json
services/central-service/**
```

## 13. QA Matrix

MAR-1.0 must prove:

- public schemas reject workspaceRoot/rootRealPath/path/fileSha256/workbook/html;
- manual Artifact identity is stable and does not include sessionId;
- duplicate same file replay returns the same artifact;
- same relativePath with changed sourceDigest fails closed;
- lifecycle overlay works for registered artifacts;
- Task Detail artifact projections are not corrupted by taskless artifacts;
- Contracts/Core tests and `audit:dtp4` pass.

MAR-1A must additionally prove:

- Renderer sends no path or workspace authority;
- Main owns picker path and rejects escape/traversal/null/UNC/drive/root;
- symlink, directory, non-regular file, hardlink count > 1, missing file, too
  large file, and unsupported extension are typed failures;
- streaming digest is bounded and file handle closes in all branches;
- file drift during registration fails closed;
- no content preview, parser, Document Worker call, or Tool registration exists;
- registered artifacts can be record-deleted/restored and opened/exported only
  through APV private authority;
- 100 to 1000 registration attempts leave no handles, timers, temp files, or
  listeners behind.

Static scans:

```text
Renderer/Preload: no workspaceRoot/rootRealPath/absolutePath/filePath/fileSha256/workbook/html
Tool Registry: no artifact.* Tool and no manual registration Tool
Document Worker/Central: no MAR implementation
lockfile/root config: unchanged unless separately authorized
```

Full gates:

```text
pnpm --config.verify-deps-before-run=false run build
pnpm --config.verify-deps-before-run=false exec vitest run <focused MAR tests>
pnpm --config.verify-deps-before-run=false exec vitest run packages/contracts/tests
pnpm --config.verify-deps-before-run=false exec vitest run services/core/tests
pnpm --config.verify-deps-before-run=false exec vitest run services/document-worker/tests
pnpm --config.verify-deps-before-run=false exec vitest run apps/desktop/tests
CI=true pnpm --config.verify-deps-before-run=false run lint
CI=true pnpm --config.verify-deps-before-run=false run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline --config.verify-deps-before-run=false
CI=true pnpm --config.verify-deps-before-run=false run check
```

## 14. Review Questions

1. Should MAR-1.0 add a global Artifact catalog projection, or should the
   existing `ArtifactProjection` be generalized with an optional origin task?
2. Should P0 reject hardlinked files or accept them while APV-3B source delete
   still fails closed?
3. Should `.html` registration be metadata-only in MAR-1A and wait for MAR-1B to
   use APV-1C sandbox, or should `.html` be excluded from P0 entirely?
4. Should registered workspace files become eligible for Document Worker read
   Tools through a later user action, or remain APV-only artifacts?
