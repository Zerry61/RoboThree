# RoboThree Desktop Frontend Living Spec

## 1. Document Status

```text
Phase: DFE Frontend Living Spec
Status: DFE-0 PASS/CLOSED / DFE-5A.1 PASS/CLOSED / DFE-5B.1 PASS/CLOSED / DFE-5B.2 PASS/CLOSED / DFE-6.0 REVIEW PASS / DFE-6A PASS/CLOSED / DFE-6B PASS/CLOSED / Frontend Experience Foundation PASS/CLOSED / DFE-7A 0.0.0-dfe.7a PASS/CLOSED / DFE-8A/8B IMPLEMENTED / INDEPENDENT QA PENDING
Date: 2026-08-30
Owner: Codex 5.6
Scope: Desktop Renderer frontend planning, DFE-5A.1, DFE-5B.1, DFE-5B.2, DFE-6.0 closure planning baselines, and DFE-7A Robot/Tool Catalog Renderer consumption implementation
```

This Living Spec captures the executable frontend baseline for DFE. It does not
replace the PRD, accepted Contracts, ADRs, Feature Specs, or security baseline.
When this document conflicts with a higher-priority source, the higher-priority
source wins and this file must be corrected.

DFE-0 and DFE-5.0 are docs-only. DFE-5B.1 subsequently completed Renderer-only
implementation, shared-file closeout and independent QA without modifying Central,
Main, Preload, Core, Contracts or lockfile; the user has formally accepted and
closed it. DFE-5B.2 is also user accepted and closed; it does not close DFE-5B as a whole.
DFE-6.0 Revision 1 is a docs-only Desktop Closure Plan and inventory pass. It does not
delete Mock data, connect new APIs, modify Main/Preload/Core/Contracts/Central,
or authorize DFE-6A/6B coding. Its review passed with non-blocking P3 observations.
DFE-6A has completed implementation, independent QA and user acceptance. DFE-6B has completed
Renderer-only implementation, shared closeout, independent QA and user acceptance. The Desktop
Frontend Experience Foundation is now PASS/CLOSED. DFE-7A Revision 1.1 independent difference review passed with
P0/P1/P2=0 and P3=2 non-blocking observations; the docs-only closeout added `runtime.request_aborted` to the
exhaustive mapping and recorded PASS only as an external review fact. The user then authorized DFE-7A coding.
`0.0.0-dfe.7a` implements existing v1alpha2 Robot/Tool Catalog consumption in the Intelligence Center. Independent
review confirmed the Renderer focused gates, but found unauthorized CPC-2 Core implementation drift in `services/core/**`.
The Core drift was subsequently authorized, independently verified, and closed as CPC-2. The user then separately accepted
DFE-7A; `0.0.0-dfe.7a` is now PASS/CLOSED. This does not unlock Skill Catalog, Tool management, creation/publishing, or any
missing backend capability.

DFE-8.0 Revision 1 froze an explicit `local_demo` Renderer entry and prototype-aligned settings pages.
The fixed `admin/123456` account is a public local fixture and not an authentication authority; non-demo mode does not
register that route or guard. Model settings retain real read-only projections while Personal Model mutation/reveal and its
form stay gated; personalization and memory are editable only in demo mode and clear on navigation; production feedback
does not read attachments or submit. Product focused review passed and the user authorized DFE-8B followed by DFE-8A;
both are implemented with developer verification complete and independent QA pending.

## 2. Source Priority

```text
Accepted Contract / ADR / security boundary
> PRD-ROBOTHREE-MVP.md v1.6 Final
> accepted module Feature Spec
> FRONTEND-EXPERIENCE-SPEC-v1.0.md
> latest accepted prototype: 原型文件/客户端/index.html
> temporary implementation assumption
```

Known baseline facts:

- The product Desktop primary navigation is fixed as Workbench, Tasks,
  Intelligence Center, Knowledge Center, and Settings.
- The current prototype uses a light, neutral, low-distraction interface.
- The current production Renderer is a single large Vue `h()` implementation in
  `apps/desktop/src/renderer/main.ts` with large page-level CSS.
- Existing Desktop Main, Preload, Core, Task, Confirmation, Artifact, Snapshot,
  Event reconnect, and recovery chains must remain authoritative.
- Mock and Prototype views must be visibly distinct from real product state.
- Model management is security-sensitive because it can involve Credentials.
  `MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md` freezes the product semantics, but
  DFE-5A cannot collect, store, reveal, or submit real API Keys until the
  Personal Model backend plan and controlled Credential chain are accepted.
- Personal Model settings do not provide connection testing. Saving creates an
  `unverified` model; supported runtime invocation results own later status.
- Personal Model input separates the exact Provider model identifier from the
  user-visible display name. The display name defaults to the identifier.
- A recent network failure remains selectable with a warning so a later real
  invocation can recover it. Enterprise-empty state requires explicit Personal
  Model selection when candidates exist and blocks only when neither source is usable.
- Saved Personal Model Key reveal is a product target, but it remains gated by
  an ADR-013 addendum for the reverse sensitive channel. DFE-5A does not start
  DFI-2B.

## 3. Page And Route Map

Routes use Electron-compatible hash history. DFE-1A may introduce the router,
but business pages remain gated until their own batches.

| Route | Page | Priority | Data Mode | First Coding Batch | Notes |
| --- | --- | --- | --- | --- | --- |
| `#/` | Workbench / New Task | P0 | Real + bounded Mock | DFE-2A | New task composer, workspace, robot, skill, model, recent tasks/artifacts. |
| `#/tasks` | Task List + embedded Task Detail | P0 | Real + gated Mock | DFE-2B / DFE-3A / DFE-3B | User-facing "tasks"; current production router has no separate `#/tasks/:taskId` route. Opening a task renders conversation, confirmation, task process, artifact panel and file preview inside `TasksListPage.vue`. |
| `#/intelligence` | Intelligence Center | P0 | Real Robot/Tool Catalog + Skill GATED | DFE-4A / DFE-7A | DFE-7A consumes existing v1alpha2 Robot/Tool Catalog APIs. Skill Catalog remains unavailable and must stay GATED. |
| `#/intelligence/robots/:robotId` | Robot Detail | P0 | Real Robot Catalog detail | DFE-4A / DFE-7A | Direct detail route calls `getRobotCatalog`; list Summary does not N+1 prefetch detail. |
| `#/intelligence/skills/:skillId` | Skill Detail | P0 | Mock/GATED until Feature Spec | DFE-4A | Do not show old category labels. |
| `#/intelligence/tools/:toolId` | Tool Detail | P0 | Real Tool Catalog detail | DFE-4A / DFE-7A | Direct detail route calls `getToolCatalog`; no `modelCallable` or lifecycle inference. |
| `#/intelligence/create-robot` | Create Robot | Candidate | Static/GATED | DFE-4B | No save/test/publish success before Agent Feature Spec. |
| `#/intelligence/create-skill` | Create Skill Assistant | Candidate | Static/GATED | DFE-4B | May route into a task with a confirmed creation skill only after spec. |
| `#/knowledge` | Knowledge Center | P0 Conditional | Gated default + Prototype Fixture | DFE-5B.1 | Production default is Unconfigured/Gated with zero knowledge rows. Fixture rows are test/dev only and must carry `dataOrigin=prototype` and `capabilityState=gated`. |
| `#/knowledge/:knowledgeId` | Knowledge Detail | P0 Conditional | Gated default + Prototype Fixture | DFE-5B.1 | Production default renders gated/not found without details. Fixture detail requires a safe predeclared id; unknown ids must not be reflected as source names. |
| `#/settings` | Settings Index | P0 | Mixed | DFE-5A / DFE-5B | Redirect to model management when available. |
| `#/settings/models` | Model Management | P0 | Enterprise read + personal Mock/GATED | DFE-5A | Model Experience semantics are frozen. No real API Key input/reveal, save, delete, or default selection before the Personal Model/Credential backend chain; no connection-test UI. |
| `#/settings/personalization` | Personalization | P1 Prototype | Prototype | DFE-5B | No real context injection. |
| `#/settings/memory` | Personal Memory | P1 Prototype/GATED | Prototype | DFE-5B | No Memory Store read/write. |
| `#/settings/feedback` | Feedback | P1 Prototype | Prototype | DFE-5B | No real submission channel unless separately authorized. |
| `#/settings/identity` | Legacy identity route | Compatibility redirect | Static | DFE-8B | Hidden redirect to models; not a fifth settings page. |
| `#/login` | Local demo entry | Demo only | Public fixed fixture | DFE-8A | Registered only under explicit `local_demo`; absent from normal production routes. |
| `#/__design-system` | Design System Gallery | Dev/Test only | Static fixtures | DFE-1A | Must be absent from production router table. |
| `#/legacy` | Legacy Renderer Wrapper | Temporary | Real existing UI | DFE-1A | Mechanically hosts current Renderer behavior during migration. |

Route invariants:

- `#/__design-system` is registered only under `import.meta.env.DEV` or an
  explicit test fixture.
- Production route table must not include dev-only routes or bulk mock payloads.
- Page navigation must not interrupt running tasks or close durable Core state.
- Task status, confirmation decisions, artifact lifecycle, and workspace
  authority remain Core projections, never Renderer-derived facts.

## 4. Component And Token Baseline

### 4.1 Token Baseline

DFE-1A must extract these values into semantic CSS custom properties:

| Token Class | Value |
| --- | --- |
| Background | `#fafbfc` |
| Surface | `#ffffff` |
| Surface Hover | `#f3f4f7` |
| Surface Active | `#e9ebf0` |
| Border | `#e4e6ec` |
| Border Strong | `#d0d3dc` |
| Primary | `#4f6ef7` |
| Primary Hover | `#3d5ce5` |
| Primary Subtle | `#eef1fe` |
| Text | `#1a1d2e` |
| Text Secondary | `#5f6478` |
| Text Tertiary | `#9498a8` |
| Text Placeholder | `#b8bcc9` |
| Font | `system-ui / PingFang SC / Microsoft YaHei` |
| Font Size | `12 / 13 / 14 / 15 / 18 / 22 px` |
| Line Height | `1.5` |
| Radius | `6 / 8 / 12 / 20 px` |
| Sidebar | `264 px expanded / 68 px collapsed` |
| Composer Max Width | `760 px` |
| Page Max Width | `1080 px`; narrow `960 px` |
| Motion | `150 ms`, respects reduced motion |

DFE-1A must not reintroduce the old dark gradient, glow, marketing hero,
glassmorphism, oversized shadows, or purely decorative animation.

### 4.2 First Shared Components

| Component | DFE-1A State | Required States |
| --- | --- | --- |
| `R3Button` | Required | default, hover, active, focus-visible, disabled, loading, danger |
| `R3IconButton` | Required | accessible name, tooltip, focus-visible, disabled |
| `R3Input` | Required | normal, focus, disabled, error |
| `R3Textarea` | Required | normal, focus, disabled, error, max length affordance |
| `R3Select` | Required | normal, disabled, error |
| `R3Tabs` | Required | keyboard navigation, selected, disabled |
| `R3Card` | Required | static, interactive, selected |
| `R3Tag` / `R3StatusBadge` | Required | neutral default; semantic colors only for warnings/errors |
| `R3Modal` | Required | focus trap, close semantics, labelled title |
| `R3Tooltip` | Required | hover/focus, non-essential only |
| `R3PageHeader` | Required | one primary action maximum |
| `R3SearchField` | Required | clear button and accessible label |
| `R3EmptyState` | Required | title, body, optional action |
| `R3InlineNotice` | Required | info, warning, error, success |
| `R3Skeleton` | Required | reduced motion safe |
| `R3Spinner` | Required | labelled or hidden by context |

Do not create a generic table, schema form builder, resource renderer, or JSON
schema UI until at least two stable real pages prove the abstraction is needed.

## 5. Page State Matrix

| Page | Loading | Empty | Ready | Permission Denied | Unavailable | Error | Stale | Partial |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workbench | Required | Required | Required | Required for workspace/model | Required for Core/model | Required | Required | Required |
| Task List | Required | Required | Required | Required | Required | Required | Required | N/A |
| Task Detail | Required | Required selected-none | Required | Required | Required | Required | Required | Required |
| Intelligence Center | Required | Required | Required | Required | Required | Required | Prototype marker | Required |
| Knowledge Center | Required | Required | Prototype/GATED | Required | Required | Required | Prototype marker | N/A |
| Settings Models | Required | Required | Mixed real/prototype | Required | Required | Required | Required | Partial when enterprise-only |
| P1 Settings | Required | Required | Prototype/GATED | Required | Required | Required | N/A | N/A |
| Design System | N/A | N/A | Dev/Test only | N/A | N/A | N/A | N/A | N/A |

Rules:

- No page may silently show a blank state.
- Disabled actions must expose a user-facing reason where the action is visible.
- Prototype/GATED pages must not show real success receipts.
- Task detail must use "需要人工处理" for `manual_attention` / `uncertain`
  style outcomes; it must not show infrastructure terms to ordinary users.

## 6. Current API Reverse Matrix

The following matrix maps `RoboThreeDesktopApiV1Alpha1` to frontend adapters and
pages. It is the DFE-1A baseline for avoiding duplicate IPC or fake success.

| API | Current Use | Target Adapter | Pages | Data Mode | Notes |
| --- | --- | --- | --- | --- | --- |
| `getRuntimeStatus` | `main.ts` shell refresh | `desktop-core-adapter.runtime` | Shell, Workbench | Real | Used for runtime readiness and unavailable states. |
| `createWorkspaceGrantFromPicker` | Workspace picker | `desktop-core-adapter.workspaces` | Workbench | Real | Renderer passes no path. Main owns picker. |
| `revokeWorkspaceGrant` | Revoke current grant | `desktop-core-adapter.workspaces` | Workbench, Settings if needed | Real | Keep confirmation and disabled reason in UI. |
| `listWorkspaceGrants` | Shell refresh | `desktop-core-adapter.workspaces` | Shell, Workbench | Real | Active grants only for visible picker. |
| `createSession` | New session | `desktop-core-adapter.sessions` | Workbench, Task List | Real | UI wording becomes "task" where product requires. |
| `renameSession` | Rename session | `desktop-core-adapter.sessions` | Task List | Real | Current API is session-based; product language is task. |
| `deleteSession` | Delete session | `desktop-core-adapter.sessions` | Task List | Real/GATED | Physical task deletion semantics need Feature Spec if beyond existing API. |
| `listSessions` | Sidebar list | `desktop-core-adapter.sessions` | Task List, Shell | Real | Must be projected as task list language. |
| `openSession` | Open conversation | `desktop-core-adapter.sessions` | Task List, Task Detail | Real | Does not own task state. |
| `listAgents` | Composer agent picker | `desktop-core-adapter.agents` | Workbench, Intelligence Center | Partial real | Full catalog/detail remains GATED. |
| `listModels` | Composer model picker | `desktop-core-adapter.models` | Workbench, Settings Models | Partial real | Personal model CRUD GATED. |
| `loadConversationSnapshot` | Message list | `desktop-core-adapter.conversation` | Task Detail | Real | Durable message source. |
| `listTasks` | Task tabs | `desktop-core-adapter.tasks` | Task List, Task Detail | Real | Product task list needs presentation rewrite. |
| `loadTaskDetail` | Task detail | `desktop-core-adapter.tasks` | Task Detail | Real | Source for status, steps, confirmations, artifacts. |
| `listArtifacts` | Artifact catalog | `desktop-core-adapter.artifacts` | Workbench, Task Detail | Real | Manual artifact catalog and task artifacts share panel. |
| `registerWorkspaceArtifactFromPicker` | Register file | `desktop-core-adapter.artifacts` | Workbench, Task Detail | Real | Renderer passes command only, no path. |
| `previewArtifact` | Text/markdown preview | `desktop-core-adapter.artifacts` | Task Detail, Artifact Panel | Real | Use existing sanitizer/presentation; no raw HTML. |
| `startArtifactHtmlPreview` | HTML preview | `desktop-core-adapter.artifacts` | Task Detail, Artifact Panel | Real | Existing loopback sandbox only. |
| `closeArtifactPreview` | Close HTML preview | `desktop-core-adapter.artifacts` | Task Detail, Artifact Panel | Real | Must close on route leave/unmount. |
| `setArtifactLifecycle` | Pin/dismiss | `desktop-core-adapter.artifacts` | Artifact Panel | Real | Lifecycle remains Core-owned. |
| `deleteArtifactRecord` | Remove record | `desktop-core-adapter.artifacts` | Artifact Panel | Real | Does not delete source file. |
| `restoreArtifactRecord` | Restore record | `desktop-core-adapter.artifacts` | Artifact Panel | Real | Not available when source deleted. |
| `deleteArtifactSourceFile` | Move source to Trash | `desktop-core-adapter.artifacts` | Artifact Panel | Real/destructive | Requires exact confirmation UI. |
| `openArtifactLocation` | Reveal in Finder | `desktop-core-adapter.artifacts` | Task Detail right panel | Real | No path exposed to Renderer. |
| `exportArtifact` | Export copy | `desktop-core-adapter.artifacts` | Task Detail right panel | Real | No-clobber semantics owned by Main/Core. |
| `listPendingUserConfirmations` | Not explicitly used in current `main.ts` | `desktop-core-adapter.confirmations` | Task Detail | Real | DFE-3A should decide whether needed alongside task detail. |
| `controlTask` | cancel/retry/continue/input/decision | `desktop-core-adapter.tasks` | Task Detail | Real | Confirmation scope and task revision owned by Core. |
| `submitTurn` | Composer submit | `desktop-core-adapter.tasks` | Workbench, Task Detail | Real / authorization GATED | Do not split internal runtime steps. Current strict v1alpha1 has no authorization preference; never drop a clickable UI selection. Real mode requires the versioned Contract and Core path defined by `WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md`. |
| `querySubmitTurn` | Not currently surfaced | `desktop-core-adapter.tasks` | Workbench, Task Detail | Real if needed | Use only for receipt recovery/status, not fake progress. |
| `onDesktopEvent` | Event subscription | `desktop-core-adapter.events` | App shell, Task Detail | Real | Durable reset and ephemeral streaming remain existing semantics. |

Adapter rules:

- Only `data/desktop-core-adapter.ts` and approved controllers may touch
  `window.robothreeDesktop`.
- UI components receive typed ViewModels, not raw API responses.
- Mock and Core adapters implement the same page-facing interfaces, but Mock
  cannot generate receipts, permissions, confirmations, or durable success.

## 7. Mock Inventory

| Area | Mock Allowed | Production Build Shape | Removal Gate |
| --- | --- | --- | --- |
| Workbench quick task samples | Yes | Clearly labelled examples; no durable success | Real template/spec or removed in DFE-6. |
| Workspace default visual sample | Limited | Empty/choose workspace preferred; no fake path authority | Workspace projection fields complete. |
| Smart authorization modes | Explanation only | Read-only cards labelled `待接入`; no selection, pressed state or submit summary | Versioned Contract + Core resolved mode + persistence/recovery + E2E per `WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md`. |
| Robot card supplemental fields | Yes | Prototype/GATED marker when not from `listAgents` | Full Agent catalog projection. |
| Skill catalog/list/detail | Yes | Prototype/GATED only | Agent/Skill Feature Spec + renderer projection. |
| Tool catalog/list/detail | Yes | Prototype/GATED or task-derived summaries only | Tool catalog projection. |
| Knowledge list/detail/search | Yes | Prototype/GATED only; no real query success | Knowledge Provider Feature Spec. |
| Personal model CRUD | Static/GATED only | No real API Key entry/reveal; no save/default/delete success; no connection-test UI | Accepted Model Experience review + Personal Model/Credential backend + controlled sensitive chain. |
| Robot creation | Static only | No save/test/publish success | Agent Feature Spec. |
| Skill creation | Static only | No save/test/publish success | Skill Feature Spec or creation-skill flow. |
| Personalization | Prototype | Visible Prototype/GATED status | Personalization Feature Spec. |
| Personal Memory | Prototype | No real memory content or write | Long-term Memory plan accepted. |
| Feedback | Prototype | No real submission success unless route exists | Feedback channel spec. |
| Identity | Prototype/GATED | No SSO/RBAC simulation as product fact | Enterprise Integration spec. |
| Design System fixtures | Dev/Test only | Excluded from production route table | DFE-1A production route audit. |

Mock red lines:

- No fake "saved", "published", "tested successfully", "permission granted",
  "file opened", or "provider connected" state on GATED modules.
- No real-looking API keys, absolute paths, workspace roots, token material, or
  internal IDs in screenshots or fixtures.
- No fallback from real API failure to unmarked Mock content on production P0
  pages.

DFE-5 credential red lines:

- Mock-stage settings pages must not accept real API Keys. Any visible key field
  must be disabled, placeholder-only, or explicitly fake.
- Real-stage Key input is masked by default. The owner may explicitly reveal a
  saved Personal Model Key only after the ADR-013 reverse sensitive channel is
  accepted; hide, route leave, dialog close, or unmount clears Renderer plaintext.
- Renderer may transiently process plaintext only for input, save submission, or
  owner-requested reveal. Key material must not enter global/persistent Renderer
  state, logs, traces, QA evidence, fixtures, test snapshots, error objects,
  artifacts, or durable records.
- The app does not detect or block OS screenshots or external recording. Official
  screenshots, demos, fixtures, and QA evidence use explicit fake Keys only.
- Credential storage, encryption, retrieval, deletion, OS Keychain access, and
  SQLite persistence are DFI/backend responsibilities gated by ADR-013 plus the
  accepted Model Experience review; saved-Key reveal additionally needs an
  ADR-013 addendum. Renderer must not implement them.
- Buttons for add, reveal, save, set default, delete, or provider
  connect must be disabled or labelled `待接入` until the real chain exists.
- Personal Model settings never show a connection-test action in P0.

## 8. Legacy Wrapper Migration Plan

DFE-1A must preserve the existing business behavior while creating the SFC
foundation.

### 8.1 Mechanical Steps

1. Add SFC support and `.vue` typing.
2. Move the current `App = defineComponent(...)` implementation from
   `main.ts` into `legacy/LegacyWorkbench.ts` or an equivalent temporary legacy
   component.
3. Keep existing imports from `presentation/**` and `workspace-picker-request`
   unchanged unless path moves are mechanically required.
4. Create `app/App.vue` with a router outlet and app-level providers.
5. Create `app/router.ts` using hash history.
6. Register the legacy page as the only production route at first.
7. Mount `App.vue` from `main.ts`; `main.ts` becomes bootstrap only.
8. Keep existing CSS available during the legacy phase; tokenized styles are
   introduced alongside but do not rewrite legacy business UI in DFE-1A.

### 8.2 Must Not Change In DFE-1A

- User-visible task execution behavior.
- Preload API request shapes.
- Snapshot/Event replay handling.
- Artifact preview lifecycle and HTML sandbox close behavior.
- Confirmation command semantics.
- Workspace picker semantics.
- Existing presentation tests.
- Existing Desktop integration tests.

### 8.3 Required Assertions

- Existing Desktop E2E and Renderer boundary tests still pass after migration.
- Legacy route can submit a turn, receive events, preview artifacts, and close
  HTML preview exactly as before.
- `window.robothreeDesktop` access is limited to the legacy component during the
  transition and to the approved adapter/controller layer once the new adapter
  is introduced.

## 9. DFE-1A Dependency And Build Window

DFE-1A is the only batch currently authorized to request dependency and build
configuration changes, and only after DFE-0 is accepted and DFE-1A is separately
authorized.

Allowed dependency additions:

| Package | Dependency Class | Purpose |
| --- | --- | --- |
| `@vitejs/plugin-vue` | devDependency | Compile Vue SFC with Vite. |
| `vue-router` | dependency | Hash router for Desktop pages. |
| `@vue/test-utils` | devDependency | Component tests. |
| `happy-dom` | devDependency | Lightweight DOM environment for Vitest. |

Allowed files for DFE-1A:

```text
apps/desktop/src/renderer/**
apps/desktop/tests/**
apps/desktop/package.json
apps/desktop/vite.config.mjs
apps/desktop/tsconfig.renderer.json
pnpm-lock.yaml
docs/development/frontend/**
```

Forbidden in DFE-1A:

- Main, Preload, IPC, Core, Central, public Contracts.
- Root `package.json` and root `tsconfig.json`.
- Pinia, Tailwind CSS, third-party UI library, animation library, chart library,
  Markdown HTML renderer, browser E2E/visual dependency.
- New product capability, new Tool, new Admin, Memory, SSO/RBAC, or Provider
  integration.

Supply-chain checks for DFE-1A:

```text
pnpm install --frozen-lockfile
CI=true pnpm install --frozen-lockfile --offline
pnpm --filter @robothree/desktop build
pnpm exec vitest run apps/desktop/tests
pnpm run check
```

The exact package versions must be recorded in the DFE-1A development log after
installation. If lockfile cannot be updated cleanly or offline install cannot
pass, DFE-1A must stop before production implementation continues.

## 10. SFC Type Configuration

DFE-1A must make SFC files visible to the renderer type boundary.

Expected changes after authorization:

- `apps/desktop/vite.config.mjs` imports and registers `@vitejs/plugin-vue`.
- `apps/desktop/tsconfig.renderer.json` includes `src/renderer/**/*.vue`.
- A controlled Vue shim is added if required by the selected tooling, for
  example `src/renderer/vue-shim.d.ts`.
- Component tests compile `.vue` files under Vitest.
- No `.vue` file is excluded from renderer boundary scans.

Acceptance:

- TypeScript build and Vite build both pass.
- Component test fixture imports at least one `.vue` component.
- Boundary tests scan `.vue` and `.ts` sources together.

## 11. Renderer Directory-Level Security Scan Rules

DFE-1A must replace `main.ts`-only security checks with directory-level checks.

Scan scope:

```text
apps/desktop/src/renderer/**/*.{ts,vue}
apps/desktop/src/renderer/**/*.css
apps/desktop/tests/**/*.{ts,tsx}
```

Forbidden in Renderer production code:

```text
node:fs
fs/promises
child_process
node:http
node:https
node:net
node:tls
node:dns
node:dgram
sqlite
ipcRenderer
contextBridge
XMLHttpRequest
EventSource
WebSocket
fetch(
.fetch(
authorizationToken
selectionHandle
rootRealPath
workspaceRoot
credentialReference
apiKey
accessKey
secret
private thinking
resultPayload
executionReceipt
CapabilityLock
checkpoint
effect
```

Restricted terms:

- `window.robothreeDesktop` may appear only in `data/desktop-core-adapter.ts`,
  approved controllers during migration, and temporary `legacy/LegacyWorkbench`
  until its replacement is complete.
- `innerHTML` is forbidden except in a separately reviewed sanitizer path. DFE
  does not currently need such a path because existing artifact preview renders
  structured blocks and HTML preview uses sandboxed iframe.
- `iframe` is allowed only for existing artifact HTML preview presentation with
  `sandbox=""` and `referrerpolicy="no-referrer"`.

Required tests:

- Scan all renderer `.ts` and `.vue` files.
- Assert baseline components do not import or touch Preload API.
- Assert mocks do not contain real-looking credentials, absolute workspace
  roots, or internal transport fields.
- Assert production router table excludes dev-only Design System route.

## 12. Visual Screenshot Baseline

DFE-0 freezes naming and required viewports. DFE-1A and later batches must attach
manual visual evidence using this naming pattern:

```text
DFE-<batch>-1180x760-<page>-<state>.png
DFE-<batch>-900x600-<page>-<state>.png
```

Baseline viewports:

- `1180 x 760`: default Desktop working size.
- `900 x 600`: minimum supported Desktop window.

Required screenshot groups:

| Batch | Required Screens |
| --- | --- |
| DFE-1A | Design System gallery, focus states, disabled/loading/error component states, legacy route unchanged. |
| DFE-1B | Shell expanded/collapsed, all five primary nav entries, loading/empty/error shell states. |
| DFE-2A | Workbench ready, empty workspace, permission denied, model unavailable, long Chinese task input. |
| DFE-2B | Task list empty, ready, pinned ordering, delete disabled, delete confirmation. |
| DFE-3A | Task detail conversation, streaming, confirmation, manual attention, task controls. |
| DFE-3B | Right panel overview, workspace file mock, text preview, HTML preview, unsupported binary. |
| DFE-4A | Robot, skill, tool lists; no robot status badges; neutral tool risk labels. |
| DFE-5A | Enterprise model list, personal model gated, no-real-key-input warning, error/unavailable states. |
| DFE-5B | Knowledge gated page, memory prototype, feedback prototype, identity gated. |
| DFE-6 | Final five-nav pass and remaining mock inventory screenshots. |

Visual review rules:

- Screenshots support human review; they do not replace product acceptance.
- No new Playwright/Electron visual dependency is allowed before a separate
  review approves it.
- Long Chinese, long filenames, and narrow viewport wrapping must be checked in
  every page batch where relevant.

## 13. DFE-1A Exit Checklist

DFE-1A cannot close unless all items pass:

- Dependencies limited to the four approved packages.
- Lockfile update is isolated and offline frozen install passes.
- `main.ts` is bootstrap-only.
- Legacy route preserves existing business behavior.
- SFC `.vue` files are covered by TypeScript and tests.
- Design System route is dev/test only and absent from production router table.
- Directory-level renderer security scan replaces single-file checks.
- Existing Presentation, Preload, Desktop integration, Artifact preview, Task,
  Confirmation, and recovery tests pass.
- No business page is rewritten beyond the legacy wrapper.
- User visually accepts token and component baseline.

## 14. DFE-0 Self-Check

| Requirement | Result |
| --- | --- |
| Frontend Living Spec created | PASS |
| Page/route map included | PASS |
| API reverse matrix included | PASS |
| Mock inventory included | PASS |
| Legacy Wrapper migration plan included | PASS |
| DFE-1A dependency window included | PASS |
| SFC type configuration included | PASS |
| Directory-level security scan rules included | PASS |
| Visual screenshot baseline included | PASS |
| Production Renderer unchanged | PASS |
| Dependencies and lockfile unchanged | PASS |
| Contracts, IPC, Core, Central unchanged | PASS |

DFE-0 remaining gate:

```text
DFE-0: IMPLEMENTED / DOCUMENT REVIEW PENDING
DFE-1A: GATED
DFE-1B-DFE-6: GATED
```

## 15. DFE-5.0 Self-Check

DFE-5.0 is docs-only and freezes the safety boundary for settings, model
management, knowledge, and P1 settings pages.

| Requirement | Result |
| --- | --- |
| DFE-5A / DFE-5B page scope documented | PASS |
| Model Experience Feature Spec product semantics frozen | PASS |
| Credential no-collection red line documented | PASS |
| Controlled owner reveal and ADR-013 reverse-channel gate documented | PASS |
| Credential no-log/trace/evidence/fixture leakage rule documented | PASS |
| OS screenshot detection explicitly out of scope; official evidence uses fake Keys | PASS |
| Credential storage delegated to future DFI/backend chain | PASS |
| Mock/real boundary for enterprise vs personal model state documented | PASS |
| No connection-test UI and `unverified` initial state documented | PASS |
| Provider model identifier and user-visible display name separated | PASS |
| Network-failure retry path has no disabled-state dead end | PASS |
| Enterprise-empty Personal Model selection and all-models-unavailable block documented | PASS |
| User preferred model vs robot-scoped effective model documented | PASS |
| DFI-2B remains independently GATED | PASS |
| Knowledge/Memory/Feedback/Identity real-success gates documented | PASS |
| Renderer/Core/Contracts/IPC/SQLite/lockfile no-change boundary documented | PASS |
| DFE-5A QA matrix includes static scan and sensitive-field scan requirements | PASS |

## 16. DFE-5B.1 Knowledge Foundation Freeze

DFE-5B.1 is a Prototype/GATED frontend foundation for Knowledge Center. It is
not a Knowledge Provider integration and must not create a real retrieval
surface.

Required implementation constraints once coding is authorized:

- `#/knowledge` replaces the generic shell with a Knowledge Center page whose
  production default is Unconfigured/Gated. It must not show Fixture knowledge
  rows in the formal production default.
- `#/knowledge/:knowledgeId` displays details only for predeclared safe Fixture
  ids in explicit Fixture/test/dev visual scenarios. Unknown ids render Not
  found and are not reflected as source names.
- `KnowledgeAdapter` is the page interface. `GatedKnowledgeAdapter` is the
  production default and returns `unconfigured/gated` with zero rows.
  `FixtureKnowledgeAdapter` is allowed only in tests, development visual
  scenarios, or explicit Fake Adapter injection.
- Neither adapter may call `window.robothreeDesktop`, Preload, IPC, Core,
  Provider endpoints, local files, LocalStorage, sessionStorage, indexedDB, or
  storage.
- Formal pages must not use Fixture data as an error fallback.
- Every Fixture source and sample result carries `dataOrigin: "prototype"` and
  `capabilityState: "gated"`.
- Pages must keep visible copy such as "示例数据" and "真实检索待接入".
- Sample result cards must not use real-success language such as "命中",
  "召回", "引用成功", "已检索", "同步完成", or "索引完成".
- Unavailable, Permission denied, Error, and Partial are Fixture/Fake Adapter
  states only. They must not be presented as real Provider or real permission
  facts.
- Production default Unconfigured/Gated state must not show a search box,
  detail entry, knowledge list, or sample result card. Search appears only in
  Fixture scenarios, filters local Fixture display fields only, and does not
  persist search terms or emit telemetry.
- `R3SearchField` currently has placeholder-only labeling. DFE-5B.1 coding must
  add a real accessible label path to the public component or use a visible
  label with formal input association, and must cover that with component
  regression tests.
- Renderer output must not include Token, Credential, CapabilityLock, API Key,
  requestDigest, workspaceRoot, rootRealPath, selectedPath, providerEndpoint,
  rawChunk, observation, payload, embedding, vector, indexJob, or syncJob.
- Errors use fixed user-facing summaries and must not stringify internal error
  objects or display stacks/provider responses.

Engineering closeout rule:

- The frontend coding window may modify only `apps/desktop/src/renderer/**` and
  `apps/desktop/tests/**`.
- After code and tests freeze, Codex 5.6 must use an exclusive shared-file
  closeout window for Desktop version, CHANGELOG, DEVELOPMENT-LOG, README, and
  any audit version baseline before independent QA.

DFE-5B.1 closure:

```text
DFE-5A.1: PASS/CLOSED
DFE-5B.1: PASS/CLOSED
DFE-5B.2: PASS/CLOSED
DFE-6.0: REVIEW PASS
DFE-6A: PASS/CLOSED
DFE-6B: PASS/CLOSED
DFE-6: PASS/CLOSED
DFI-2-DFI-4: GATED
```

## 17. DFE-6.0 Desktop Closure Plan

DFE-6.0 Revision 1 freezes the current Desktop frontend inventory before any final DFE-6A/6B
coding. The formal plan is
[`DFE-6.0-DESKTOP-CLOSURE-PLAN.md`](./DFE-6.0-DESKTOP-CLOSURE-PLAN.md).

DFE-6.0 must remain document-only:

- no Renderer code changes;
- no Mock deletion;
- no new Adapter, Contract, IPC, Core, Central, Main, Preload or SQLite work;
- no version bump;
- no DFI-4A.1 Domain/Contract/migration/Persistence revisions.

Current closure inventory:

| Area | Real convergence | Must remain GATED |
| --- | --- | --- |
| Workbench | Existing Desktop API for workspace/session/agent/model/recent artifacts and submit turn | Authorization mode semantics and Knowledge provider selection |
| Tasks | Existing Desktop API for list/detail/control/confirmation/artifact preview; Task detail is embedded in `#/tasks`, not a separate `#/tasks/:taskId` route | Persistent pinning and any new physical delete/audit semantics |
| Task detail workspace files | DFE-6A consumes the PASS/CLOSED DFI-1B v1alpha2 sidecar and has replaced the fixed workspace-file placeholder | File content read/edit, Renderer paths, and any path-bearing command remain forbidden |
| Intelligence | `listAgents/listModels` for robot/model summary | Skills, full Tool catalog, creation, test, publish and package lifecycle |
| Knowledge | Production default unconfigured/gated state | Provider, query, index, sync, permission and citation facts |
| Settings models | Coarse `listModels` read-only enterprise/platform display | Personal Model CRUD, Credential, Key reveal, default/effective model and detailed status facts |
| Settings P1 pages | Stable route and gated shell | Personalization, Memory, Feedback, Identity/SSO/RBAC real behavior |

DFE-6.0 also maps frontend dependencies on DFI-1B, DFI-2B, DFI-3 and DFI-4A.2～4A.4:

- DFI-1B has passed QA and user acceptance. DFE-6A consumes
  `window.robothreeDesktopV1Alpha2.getCompatibility`, `listWorkspaceEntries`
  and `openTaskWorkspaceLocation` and has replaced the fixed Task detail workspace
  file placeholder. Query and command inputs must remain distinct:
  `listWorkspaceEntries` may pass only `taskId`, opaque `parentEntryId`, opaque
  `cursor` and `limit`; `openTaskWorkspaceLocation` may pass only `taskId` plus
  fixed command metadata.
- DFI-2B may provide authorization/workspace authority projection consumed by
  Workbench and Task detail; DFE must not invent fields before the Contract lands.
- DFI-3 may provide task-loop and recovery projection changes consumed by Task
  detail; DFE must wait for stable status and confirmation material.
- DFI-4A.2～4A.4 may provide Personal Model/Credential lifecycle, Provider
  validation and default/effective model projections consumed by Settings
  models; DFE keeps personal model controls gated until those batches close.

DFE-6.0 does not claim DFI-4A.1 approval. DFI-4A.1 Revision 3.2 remains
`DOCUMENT REVIEW PENDING / CODING GATED`; Revision 3.3 is owned by Codex 5.6 /
the backend lead.

DFE-6 coding is split:

- DFE-6A: existing-interface real data convergence, with Task detail workspace
  file tree as the first target;
- DFE-6B: five-navigation visual, keyboard, state matrix and remaining Mock
  inventory closeout.

Both remain `CODING GATED`. Closing DFE-6 only closes the Frontend Experience
Foundation; it does not close DFI, TGM, Personal Model/Credential, Knowledge
Provider, Agent/Skill creation or formal installer work.

## 18. DFE-6A Workspace Files

Status: `0.0.0-dfe.6a` PASS/CLOSED.

DFE-6A is documented in
[`DFE-6A-WORKSPACE-FILES-REAL-DATA-CONVERGENCE-PLAN.md`](./DFE-6A-WORKSPACE-FILES-REAL-DATA-CONVERGENCE-PLAN.md).

It may proceed to coding only after separate user authorization. The plan freezes:

- a v1alpha2 Task Workspace Adapter and InjectionKey;
- feature negotiation for `task_workspace_browser` and `task_workspace_reveal`;
- Core restart handling by invalidating cached `runtimeInstanceId` state;
- selected task switch cleanup and late response discard;
- root load, single-level lazy directory navigation, breadcrumb and cursor paging;
- stale cursor safe refresh;
- directory/file/symlink presentation, with symlink never navigable;
- reveal as task-root-only `openTaskWorkspaceLocation(taskId)`;
- no paths, WorkspaceGrant authority, Credentials or raw Core errors in Renderer.

DFE-6A must distinguish query and command inputs:

- `listWorkspaceEntries`: `taskId + parentEntryId? + cursor? + limit?`;
- `openTaskWorkspaceLocation`: `taskId` plus fixed command metadata only.

## 19. DFE-6B Frontend Foundation Closeout

Status: `0.0.0-dfe.6b` PASS/CLOSED.

DFE-6B is documented in
[`DFE-6B-FRONTEND-FOUNDATION-CLOSEOUT-PLAN.md`](./DFE-6B-FRONTEND-FOUNDATION-CLOSEOUT-PLAN.md).

DFE-6B may only close the Frontend Experience Foundation:

- five primary navigation visual, keyboard, focus, ARIA and window-size acceptance;
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial coverage;
- remaining Mock / Prototype / GATED inventory and removal gates;
- DFE-6A workspace-files regression;
- Legacy wrapper retain/hide/delete decision;
- safe Renderer-only test and closeout plan.

It does not close DFI, TGM, Personal Model/Credential, Knowledge Provider,
Agent/Skill creation, OS Sandbox or formal installer work.

Implementation summary:

- `DesktopShell.vue` now exposes localized primary navigation and main-content labels and a visible
  keyboard focus ring for primary navigation links;
- `frontend-closeout-presentation.ts` freezes the five-navigation closeout inventory, required state
  matrix, remaining GATED inventory and Legacy hidden-maintenance decision as testable data;
- tests lock the closeout inventory, Legacy non-primary status, shell accessibility labels and
  Renderer no-persistence/no-transport boundary.
