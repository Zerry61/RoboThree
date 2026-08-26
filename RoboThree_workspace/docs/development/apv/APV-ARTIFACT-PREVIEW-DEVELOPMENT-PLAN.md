# APV Artifact Preview Development Plan

> Owner: Codex 5.6
> Status: APV-0 PASS/CLOSED; APV-1.0 PASS/CLOSED; APV-1A PASS/CLOSED; APV-1B PASS/CLOSED; APV-1C PASS/CLOSED; APV-2 PASS/CLOSED; APV-3.0 PASS/CLOSED; APV-3A PASS/CLOSED; APV-3B PASS/CLOSED
> Date: 2026-08-06

## 1. Current Gate

```text
DTP-0 -> DTP-4: PASS/CLOSED
DWE-0 -> DWE-3: PASS/CLOSED

APV-0: PASS/CLOSED
APV-1.0: PASS/CLOSED
APV-1A: PASS/CLOSED
APV-1B: PASS/CLOSED
APV-1C: PASS/CLOSED
APV-2: PASS/CLOSED
APV-3.0: PASS/CLOSED
APV-3A: PASS/CLOSED
APV-3B: PASS/CLOSED
APV-3C: GATED

overwrite / bulk overwrite: GATED
OS Sandbox: GATED
formal installer: GATED
```

APV-0 is a product, security, and engineering freeze only. It does not implement
production preview code, does not register any Tool, does not change public
Contracts, and does not change dependency, lockfile, packaging, or TypeScript
root configuration.

## 2. Scope Freeze

Artifact Preview is a Desktop/Application capability, not a model-callable Tool.

Allowed for APV:

- show artifacts already produced or referenced by completed product workflows;
- use existing durable Task, Run, Tool Activity, Observation, and file metadata as
  the fact source;
- display bounded metadata and controlled previews in Desktop;
- keep the same artifact identity across conversation cards, the right-side
  artifact panel, and task detail;
- use WorkspaceGrant and realpath containment before reading a workspace file for
  preview.

Forbidden in APV:

- `artifact.preview` as a Tool ID or model-visible schema;
- file create, overwrite, append, patch, delete, rename, move, or bulk operation;
- overwrite confirmation UI or dynamic Risk Inspector;
- Document Worker parser or writer changes;
- public Contract changes unless a blocker is reported before coding;
- external network fetches from preview content;
- Renderer direct filesystem access;
- Node, Electron, preload, shell, or arbitrary process access from previewed
  content;
- OS-level sandbox claims. APV sandboxing is an application boundary only.

## 3. Product Source Facts

Accepted product baselines mention:

- Task generated artifacts can be viewed, filtered by task/type/time, opened in a
  controlled way, and distinguished from working files and temporary previews;
- controlled local HTML preview is localhost-only, must not expose public network
  access, must stop on exit, and must not run system commands or auto-install
  dependencies;
- the UI needs artifact cards and a right-side artifact panel backed by the same
  artifact facts;
- Markdown preview and HTML preview require separate safety boundaries.

DWE has already produced stable Document Tool result metadata for PDF, XLSX,
DOCX, and create-only XLSX write. APV can consume that metadata later without
changing DWE.

## 4. Concepts

### Artifact

An Artifact is a durable product fact that a user may inspect from Desktop. It is
not the file itself and does not grant new filesystem authority.

Required identity:

```text
artifactId
taskId
sourceKind
sourceId
sourceDigest
createdAt
```

`sessionId` is deliberately not part of Artifact identity. It is projection and
display context only, used by Desktop to decide where the same artifact reference
is shown. The same durable source must produce the same `artifactId` across
different Desktop session projections.

`sourceKind` may start with:

- `tool_observation`
- `workspace_file`
- `generated_preview`

APV-1 should initially derive artifacts from existing Tool Observations and
bounded output metadata. Manual lifecycle management remains gated.

### Workspace File Artifact

A Workspace File Artifact may reference a path only as a workspace-relative path.
Absolute paths are private to Core/Desktop main process and must not enter
Renderer state, model context, logs, screenshots, or user-copyable payloads.

### Preview Session

A Preview Session is a short-lived Desktop/Application runtime resource for
rendering content. It is not durable business state.

Preview sessions must be:

- read-only;
- tied to one artifact ID;
- bounded by byte, file count, lifetime, and listener limits;
- closed on task switch, panel close, app shutdown, Core restart, or explicit
  user close.

## 5. Private Schema Draft

The following schemas are Application-private drafts. APV-0 does not add them to
`packages/contracts/**`.

### ArtifactIndexEntry

```ts
type ArtifactIndexEntry = {
  schemaVersion: "robothree-artifact-preview/v1alpha1";
  artifactId: string;
  taskId: string;
  sessionId: string;
  sourceKind: "tool_observation" | "workspace_file" | "generated_preview";
  sourceId: string;
  sourceDigest: string;
  displayName: string;
  kind: "document" | "spreadsheet" | "markdown" | "html" | "text" | "image" | "unknown";
  mediaType: string;
  relativePath?: string;
  byteSize?: number;
  createdAt: string;
  previewState: "available" | "unsupported" | "too_large" | "blocked" | "missing";
  metadata: Record<string, unknown>;
};
```

Constraints:

- `artifactId` is derived from `taskId + sourceKind + sourceId + sourceDigest`;
- `sessionId` is not part of `artifactId` derivation and must not change artifact
  identity;
- `displayName` is normalized to NFC, trimmed, and bounded to 160 Unicode scalar
  values;
- `relativePath` is present only for Workspace files and is never absolute;
- `metadata` is bounded to 4 KiB serialized JSON for Desktop projection.

### ArtifactPreviewRequest

```ts
type ArtifactPreviewRequest = {
  schemaVersion: "robothree-artifact-preview/v1alpha1";
  artifactId: string;
  mode: "metadata" | "text" | "markdown" | "html";
  maxBytes: number;
};
```

Constraints:

- Renderer supplies only `artifactId`, `mode`, and UI budget;
- Core/Desktop main process resolves workspace authority from existing session and
  WorkspaceGrant state;
- Renderer must not pass absolute path, workspace root, shell command, URL allow
  list, or filesystem token.

### ArtifactPreviewResult

```ts
type ArtifactPreviewResult =
  | {
      status: "ok";
      artifactId: string;
      mode: "metadata" | "text" | "markdown";
      content: string;
      byteSize: number;
      truncated: boolean;
      warnings: string[];
    }
  | {
      status: "ok";
      artifactId: string;
      mode: "html";
      previewSessionId: string;
      localOrigin: "http://127.0.0.1";
      warnings: string[];
    }
  | {
      status: "error";
      artifactId: string;
      code:
        | "not_found"
        | "unsupported"
        | "too_large"
        | "path_denied"
        | "permission_denied"
        | "preview_blocked"
        | "render_failed"
        | "timed_out";
      detailCode?: string;
    };
```

`previewSessionId` is Desktop-private and must not be sent to model context.

## 6. Security Model

### Authority

APV does not create authority. It reuses an existing Desktop session and
WorkspaceGrant. Every workspace file preview must:

1. read the current WorkspaceGrant;
2. require the artifact relative path to be workspace-relative;
3. reject null bytes, traversal, UNC, Windows drive, absolute paths, and empty
   segments;
4. resolve `realpath` for the workspace root and target;
5. verify target containment after realpath;
6. open only the verified file for bounded read;
7. close FileHandle on completion, cancel, timeout, and error.

### Leakage

APV projections must not leak:

- absolute workspace root;
- user home directory;
- temp directory paths;
- raw file content beyond explicit preview budgets;
- Document Worker private payloads;
- WorkspaceGrant internals;
- Credential, model, adapter, binding, or registry material.

### Markdown Preview

Markdown preview must be implemented as sanitized rendering:

- raw HTML is disabled or sanitized to an allow list;
- script, iframe, object, embed, style injection, event handlers, javascript URLs,
  data URLs, remote images, and remote links with automatic navigation are blocked;
- code blocks render as inert text;
- no filesystem, preload, Electron, Node, or network authority is available to the
  rendered content.

### HTML Preview

HTML preview is the highest-risk APV slice and must be implemented separately from
metadata and Markdown.

Requirements:

- preview runs without Node integration, Electron preload, remote module,
  filesystem access, shell, child process, or arbitrary IPC;
- all external network is denied by default;
- navigation, popups, downloads, permission prompts, and file protocol loads are
  blocked;
- if a local server is used, it binds only to `127.0.0.1`, serves only a verified
  preview directory, denies dotfiles and traversal, and shuts down on app exit,
  session close, task close, and renderer crash;
- Content Security Policy must deny scripts by default unless a later reviewed
  HTML-interactive preview batch explicitly grants a stricter subset;
- no claim is made that this equals OS-level sandboxing.

## 7. Runtime Ownership

```text
Durable facts
  -> Core application projection
  -> Desktop main IPC boundary
  -> Renderer read-only artifact panel
  -> optional Preview Session
```

Ownership rules:

- Core owns durable Task/Run/Observation facts and bounded artifact projection;
- Desktop main owns preview session lifecycle and any local preview serving;
- Renderer owns display state only;
- Document Worker is not part of APV runtime execution;
- the model never receives APV-only preview session state.

## 8. APV-1 Breakdown

APV-1 should be split to avoid mixing product UI, rendering security, and preview
server lifecycle in one batch.

### APV-1.0 Artifact Projection Foundation

Goal:

- build Application-private artifact index projection from existing durable
  facts;
- no preview rendering;
- no file open;
- no public Contract changes by default.

Expected work: 2 to 3 concentrated engineering days.

### APV-1A Desktop Artifact Panel

Goal:

- add right-side artifact panel and conversation artifact cards backed by the same
  artifact projection;
- metadata-only inspection;
- no Markdown/HTML rendering.

Expected work: 2 to 4 concentrated engineering days.

### APV-1B Markdown/Text Preview

Goal:

- add bounded text and sanitized Markdown preview;
- prove no raw HTML/script/network/navigation/file access.

Expected work: 2 to 3 concentrated engineering days.

### APV-1C HTML Preview Sandbox

Goal:

- add controlled local HTML preview with independent sandbox, lifecycle, and
  server shutdown tests;
- no OS-level sandbox claims.

Expected work: 4 to 6 concentrated engineering days.

### APV-2 File Lifecycle Extensions

Goal:

- implement metadata-only lifecycle actions for generated artifacts:
  pin/unpin and dismiss/restore;
- implement Main-owned open file location and export copy actions using only
  `artifactId` from Renderer;
- keep source file deletion, manual artifact registration, workspace file preview,
  overwrite, OS Sandbox, and formal installer gated.

Expected work: 2 to 4 concentrated engineering days.

Overall APV estimate:

```text
APV-0: 0.5 to 1 concentrated engineering day
APV-1.0: 2 to 3 concentrated engineering days
APV-1A: 2 to 4 concentrated engineering days
APV-1B: 2 to 3 concentrated engineering days
APV-1C: 4 to 6 concentrated engineering days
APV-2: 2 to 4 concentrated engineering days
Total APV-1 path before APV-2: 10 to 16 concentrated engineering days
```

This estimate excludes independent QA, rework, and user on-site acceptance.

## 9. APV-1.0 Allowed Modification Scope

Allowed:

```text
services/core/src/application/**
services/core/src/adapters/http/**
services/core/tests/**
services/core/package.json
apps/desktop/src/main/**
apps/desktop/src/renderer/**
apps/desktop/src/shared/**
apps/desktop/tests/**
tests/e2e/**
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/apv/**
```

Conditional:

```text
packages/contracts/**
```

Public Contracts remain forbidden unless APV-1.0 implementation discovers a hard
IPC boundary blocker and reports it before coding.

For APV-1.0, a public Contract hard blocker exists only if all conditions below
are true:

- APV-1.0 must expose artifact projection across an existing package boundary in
  the same coding batch;
- the existing Desktop Local v1alpha1 query/response schemas cannot carry that
  projection without weakening validation or using untyped `unknown` payloads;
- an Application-private schema inside Core and Desktop main is insufficient for
  the required APV-1.0 tests;
- delaying the public schema to APV-1A would prevent Artifact Projection
  Foundation from being meaningfully tested.

If any condition is false, APV-1.0 must keep `packages/contracts/**` unchanged.
The default APV-1.0 implementation path is Core Application-private projection
only, with no new IPC route and therefore no public Contract blocker.

Forbidden:

```text
services/document-worker/src/**
services/central-service/**
pnpm-lock.yaml
root tsconfig.json
Tool Registry / model-visible tool schemas
Document Worker parser/writer capabilities
overwrite / bulk overwrite / destructive file UI
OS Sandbox / formal installer
```

## 10. Typed Errors

APV private error codes:

| Code | Meaning |
| --- | --- |
| `not_found` | Artifact or source fact does not exist |
| `unsupported` | Artifact kind or preview mode is not supported in this APV slice |
| `too_large` | File or projection exceeds preview budget before unsafe allocation |
| `path_denied` | Relative path or realpath containment check failed |
| `permission_denied` | WorkspaceGrant missing, revoked, or not valid for preview |
| `preview_blocked` | Sandbox or content policy blocked the preview |
| `render_failed` | Renderer/main preview conversion failed without leaking content |
| `timed_out` | Existing runtime deadline/timeout vocabulary; do not introduce `deadline_exceeded` |

`uncertain` is not an APV Renderer error. If a future recovery layer cannot
classify preview state after crash, that classification belongs to Core recovery
logic and must be separately designed.

## 11. QA Matrix

APV-0 review must verify:

- plan exists under `docs/development/apv/`;
- APV remains Desktop/Application capability, not a Tool;
- no production code changed;
- no public Contracts changed;
- no dependency, lockfile, root package, or root tsconfig changed;
- APV-1 and APV-2 remain gated.

APV-1.0 QA must verify:

- artifact projection derives from existing durable facts only;
- same artifact ID appears in conversation card, panel, and task detail;
- model request schema and Tool Registry contain no `artifact.preview`;
- no absolute workspace path in Renderer state, logs, snapshots, task detail, or
  model context;
- metadata projection is bounded and deterministic;
- unsupported artifact kinds fail closed;
- close/reopen recovers artifact projection from durable facts;
- stale source fact, missing file, revoked WorkspaceGrant, and path traversal
  return typed failures;
- existing DTP/DWE read/write tools fully regress.

APV-1B QA must additionally verify:

- Markdown raw HTML/script/event handler/iframe/object/embed/style/javascript URL
  fixtures are inert or rejected;
- external resource fetch and navigation are blocked;
- preview content obeys byte and block budgets.

APV-1C QA must additionally verify:

- local preview binds only to `127.0.0.1`;
- preview server serves only a verified directory;
- traversal, symlink escape, dotfiles, download, popup, navigation, file protocol,
  external network, Node, Electron, preload, and IPC access are denied;
- preview sessions close on panel close, task switch, app shutdown, renderer crash,
  timeout, and Core restart;
- 100 to 1000 preview session cycles leave bounded handles, timers, listeners,
  server sockets, temp files, and renderer resources.

## 12. Development Order

Recommended next sequence:

1. APV-0 document review and independent QA.
2. User acceptance of APV-0.
3. Separate authorization for APV-1.0 Artifact Projection Foundation.
4. Implement APV-1.0 and run focused/full gates.
5. Independent QA.
6. User acceptance before APV-1A.

APV-1A, APV-1B, APV-1C, APV-2, overwrite, OS Sandbox, and formal installer remain
gated until separately authorized.

## 13. APV-0 Exit Criteria

APV-0 is complete when:

- this plan is written;
- APV capability boundary is frozen;
- private schema drafts are present;
- authority, leakage, Markdown, and HTML sandbox boundaries are listed;
- APV-1.0 allowed modification scope is listed;
- typed errors are listed;
- QA matrix is listed;
- APV-1.0/1A/1B/1C/APV-2 estimates are listed;
- status is reflected in README, CHANGELOG, and DEVELOPMENT-LOG;
- APV-1 remains gated.

## 14. Revision History

### Initial

Status: `APV-0 IMPLEMENTED / DOCUMENT REVIEW PENDING`.

Created after DWE-0 -> DWE-3 were accepted as `PASS/CLOSED`. This plan freezes
Artifact Preview as a Desktop/Application feature and keeps coding gated pending
document review.

### APV-0 Closure / APV-1.0 Implementation

Status: `APV-0 PASS/CLOSED; APV-1.0 PASS/CLOSED; APV-1A IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING`.

Closed APV-0 review observations:

- Clarified that `sessionId` is projection/display context and is not part of
  Artifact identity or `artifactId` derivation.
- Defined the APV-1.0 public Contract hard-blocker test and confirmed the
  default APV-1.0 implementation path is Core Application-private projection
  only, with no new IPC route and no public Contract change.

Implemented APV-1.0:

- Added Core Application-private Artifact Preview projection from durable Task
  checkpoint facts.
- Added stable `ArtifactIndexEntry` and `ArtifactSurfaceRef` schemas in Core only.
- Preserved `artifactId` across Desktop session projections.
- Reused the same artifact ref list for future conversation cards, artifact
  panel, and task detail surfaces.
- Claude Code independent QA passed with P0=0/P1=0/P2=0/P3=0, and the user
  formally closed APV-1.0 before authorizing APV-1A.

Implemented APV-1A:

- Added additive Desktop Local `v1alpha1` `TaskDetailProjection.artifacts` public
  schema because APV-1A must carry artifact metadata over the existing typed
  Desktop `loadTaskDetail` boundary.
- Kept artifact payload metadata-only: no `workspaceRoot`, workbook payload,
  preview content, `schemaVersion`, or internal projection `sessionId`.
- Reused APV-1.0 durable projection inside Core `DesktopTaskProjectionService`
  and stripped internal projection-only fields before public Contract parsing.
- Added Desktop Renderer Artifact Panel under Task Detail with displayName,
  safe relative path, kind/state, media type, size, timestamp, and source summary.
- Added pure Renderer presentation helper and tests; UI performs no file open,
  content read, Markdown/Text render, HTML render, or preview server action.
- Upgraded Contracts/Core/Desktop package versions to `0.0.0-apv.1a` and updated
  `audit:dtp4` version drift checks.
- Kept APV-1B/1C/APV-2, overwrite, OS Sandbox, and formal installer gated.

### APV-1A Closure / APV-1B Implementation

Status: `APV-1A PASS/CLOSED; APV-1B IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING; APV-1C/APV-2 GATED`.

Closed APV-1A:

- Claude Code independent QA passed with P0=0/P1=0/P2=0/P3=0.
- User formally closed APV-1A and authorized APV-1B Markdown/Text preview.

Implemented APV-1B:

- Added additive Desktop Local `v1alpha1` `ArtifactPreviewQuerySchema` and
  `ArtifactTextPreviewProjectionSchema` for bounded Text/Markdown preview over
  an `artifactId`; request schema contains no `workspaceRoot`, `relativePath`,
  `sessionId`, workbook, file token, or preview server information.
- Added Core APV-1B projection from already durable successful Document Tool
  Observations only. Core does not read workspace files, does not start a worker,
  and does not access network or shell while serving Text/Markdown preview.
- Added Desktop private HTTP route, Main IPC route, and Preload method
  `previewArtifact`; this is a Desktop/Application IPC capability, not a
  model-visible Tool and not `artifact.preview`.
- Added Renderer Text preview and constrained Markdown block rendering. Markdown
  is parsed into inert text blocks; raw HTML is escaped, Markdown links/images
  lose URLs, and known dangerous URL/event tokens are removed before rendering.
  Renderer uses Vue text nodes only and does not use `innerHTML`, iframe, webview,
  preview server, navigation, or external fetch.
- Upgraded Contracts/Core/Desktop package versions to `0.0.0-apv.1b` and updated
  `audit:dtp4` version drift checks.
- Kept APV-1C HTML sandbox, APV-2 lifecycle/open-file actions, overwrite,
  OS Sandbox, formal installer, Document Worker changes, Tool Registry changes,
  lockfile changes, root package version changes, and root `tsconfig.json`
  changes gated.
- Codex 5.6 self-test passed build, APV-1B focused 7 files / 41 tests,
  Contracts 14 files / 81 tests, Core 77 files / 576 tests, Document Worker
  22 files / 168 tests, Desktop 21 files / 84 tests, lint + architecture
  boundary, `audit:dtp4`, offline frozen install, and full `pnpm run check`
  148 files / 978 tests + three smoke checks. Sandbox-only loopback EPERM was
  resolved by non-sandbox reruns for Core/Desktop/full check.

### APV-1B Closure / APV-1C Implementation

Status: `APV-1B PASS/CLOSED; APV-1C IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING; APV-2 GATED`.

Closed APV-1B:

- Claude Code independent QA passed with P0=0/P1=0/P2=0/P3=0.
- User formally closed APV-1B and authorized APV-1C HTML Preview Sandbox.

Implemented APV-1C:

- Added additive Desktop Local `v1alpha1` schemas for `ArtifactHtmlPreviewQuery`,
  `CloseArtifactPreviewCommand`, `ArtifactHtmlPreviewProjection`, and close
  receipt. Renderer requests contain only `artifactId`, `maxBytes`, optional
  `ttlMs`, and standard metadata.
- Added Desktop Main-private `HtmlPreviewSandbox` that creates a per-session temp
  directory, writes one bounded `index.html`, and serves it through a server bound
  only to `127.0.0.1` on a random port.
- URL access is exact and tokenized. Wrong host, wrong token, wrong session,
  traversal, dotfile, null byte, non GET/HEAD, budget overflow, and failed
  realpath containment are rejected.
- Responses use deny-by-default CSP with script/connect/img/object/style/base/form
  disabled, plus no-store, nosniff, and same-origin CORP.
- Desktop Main obtains content from the existing Core bounded markdown preview
  and escapes it into a local HTML document. Core still does not read workspace
  files or host preview content.
- Renderer displays the returned local URL in an iframe with empty sandbox and
  `no-referrer`; it never passes HTML, paths, workspace root, session identity,
  workbook content, or filesystem authority.
- Session lifecycle cleans up on explicit close, task/session switch, Renderer
  unmount, window close, app quit, and TTL expiry.
- Main window hardening rejects popup creation, permission prompts, and downloads.
- Upgraded Contracts/Core/Desktop package versions to `0.0.0-apv.1c` and updated
  `audit:dtp4` version drift checks.
- Kept APV-2 lifecycle/open-file actions, overwrite, OS Sandbox, formal
  installer, Document Worker changes, Central changes, Tool Registry changes,
  lockfile changes, root package version changes, and root `tsconfig.json`
  changes gated.
- Codex 5.6 self-test passed build, APV-1C focused 7 files / 42 tests,
  Contracts 14 files / 82 tests, Core 77 files / 576 tests, Document Worker
  22 files / 168 tests, Desktop 23 files / 91 tests, lint + architecture
  boundary, `audit:dtp4`, offline frozen install, and full `pnpm run check`
  150 files / 986 tests + three smoke checks. Sandbox-only loopback EPERM was
  resolved by non-sandbox reruns for APV-1C focused, Core/Desktop/full check.

### APV-1C Closure / APV-2 Implementation

Status: `APV-1C PASS/CLOSED; APV-2 IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING; overwrite/OS Sandbox/formal installer GATED`.

Closed APV-1C:

- Claude Code independent QA passed with P0=0/P1=0/P2=0/P3=0.
- User formally closed APV-1C and authorized APV-2 file lifecycle extension.

Implemented APV-2:

- Added additive Desktop Local `v1alpha1` schemas for artifact lifecycle
  projection, `set_artifact_lifecycle`, `open_artifact_location`,
  `export_artifact`, and corresponding receipts. Commands are strict and do not
  accept workspace root, real path, relative path, target path, workbook content,
  HTML, or session identity.
- Core stores lifecycle records separately from Artifact identity and overlays
  them into Task Detail. `artifactId` and `sourceDigest` remain stable; lifecycle
  records use idempotent command replay.
- Core exposes a private-only artifact file source resolver that maps
  `artifactId` to `{rootRealPath, relativePath}` from durable Task facts and an
  active WorkspaceGrant. Renderer never receives this private authority.
- Desktop Main resolves source files with `realpath` containment immediately
  before open/export. Open location calls Electron `shell.showItemInFolder` only
  from Main and returns a path-free receipt.
- Export copy prompts from Main, writes an exclusive temp file in the target
  directory, fsyncs it, publishes with `fs.link(temp, target)` for no-clobber
  atomic visibility, fsyncs the parent when supported, and removes temp files.
  Existing targets fail closed as conflict and are not overwritten.
- Renderer Artifact Panel adds pin/unpin, dismiss/restore, reveal, and export
  controls. Renderer commands carry only `artifactId` plus lifecycle flags; no
  filesystem path, workspace grant internals, workbook body, or preview content
  crosses into Renderer-owned command payloads.
- Upgraded Contracts/Core/Desktop package versions to `0.0.0-apv.2` and updated
  `audit:dtp4` version drift checks.
- Kept source file deletion, deletion records, manual artifact registration,
  workspace file preview, overwrite, OS Sandbox, formal installer, Document
  Worker changes, Central changes, Tool Registry changes, lockfile changes, root
  package version changes, and root `tsconfig.json` changes gated.
- Codex 5.6 self-test passed build, APV-2 focused contracts/core/desktop tests,
  lint + architecture boundary, `audit:dtp4`, offline frozen install, and full
  workspace check before handoff to independent QA.
- Claude Code independent QA passed with P0=0/P1=0/P2=0/P3=0. User accepted
  APV-2 and authorized the next source delete / deletion record planning step.

### APV-2 Closure / APV-3.0 Source Delete Planning

Status: `APV-2 PASS/CLOSED; APV-3.0 PASS/CLOSED; APV-3A PASS/CLOSED; APV-3B PASS/CLOSED; APV-3C PASS/CLOSED (DOCS-ONLY)`.

APV-3.0 plan document:

```text
docs/development/apv/APV-SOURCE-DELETE-DEVELOPMENT-PLAN.md
docs/development/apv/APV-3C-HARDENING-UX-POLISH-DEVELOPMENT-PLAN.md
```

Planning decision:

- APV-3 separates Artifact record deletion from source file deletion.
- APV-3A should implement record tombstone/restore only and must not touch
  workspace files.
- APV-3B should be separately authorized for source file deletion; P0 should use
  OS Trash/Recycle Bin only and fail closed if that platform operation is
  unavailable. Permanent `unlink` remains out of scope.
- Manual artifact registration, overwrite, OS Sandbox, and formal installer
  remain gated.
