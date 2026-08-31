# WFW Workspace Text File Write Development Plan

> Owner: Codex 5.6  
> Revision: 1.1  
> Status: `WFW-0 PASS/CLOSED / WFW-1 PASS/CLOSED / WFW-2 PASS/CLOSED / WFW-3 DETAILED PLAN DOCUMENT REVIEW PENDING + CODING GATED / WFW-H1 GATED`
> Date: 2026-08-31

## 1. Gate And Goal

WFW adds one Agent-visible, general-purpose UTF-8 text writer to the existing
RoboThree Tool Runtime. It is intended to close cases such as creating a static
HTML page, Markdown document, JSON file, CSS file, or source file inside the
Task's exact WorkspaceGrant.

WFW-0 was docs-only. The user subsequently accepted Revision 1.1 and separately
authorized WFW-1. WFW-1 implements only the private writer and publication
semantics described below and is now `PASS/CLOSED`; it does not activate a Core Tool, modify a public
Contract, change a migration, install a dependency, or modify the lockfile.

```text
WFW-0 Plan Freeze:
  PLAN REVIEW PASS/CLOSED

WFW-1 Private Writer + Publication Semantics:
  PASS/CLOSED

WFW-2 Tool Activation + Policy + Effect Recovery:
  PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED

WFW-3 Artifact Projection + Desktop Product E2E:
  DETAILED PLAN DOCUMENT REVIEW PENDING / CODING GATED
```

WFW does not reopen the existing WorkspaceGrant, Tool authorization,
EffectCoordinator, Artifact, APV HTML sandbox, or durable Task architecture.

Revision 1 deliberately targets a Kernel Alpha product loop rather than a
power-loss-hardened filesystem transaction component. WFW v1 must be safe
against process failure and must classify ambiguous publication as
`uncertain`; it does not claim that directory entries survive sudden machine
power loss. The deferred hardening scope is recorded in WFW-H1 and does not
block WFW v1 closure.

## 2. Stable Identity

The canonical RoboThree capability ID is:

```text
tool.workspace.file.write_text
```

The shorter `workspace.file.write_text` wording may be used in product copy,
but it is not a second capability ID. The `tool.` prefix is retained because
the current Registry, TaskCapabilityLock, Adapter binding, audit, and Tool
Catalog all use that namespace.

User-facing name:

```text
写入文本文件
```

## 3. In Scope

WFW v1 supports:

- one Workspace-relative target per Tool Call;
- strict UTF-8 text bytes;
- `create_new` and `replace_existing`;
- `expectedPreviousSha256` compare-and-set protection for replacement;
- existing parent directories only;
- same-parent temporary-file write, file fsync, and atomic publication;
- one sibling `.prev` backup for replacement;
- lexical traversal, symlink, hard-link, and Workspace escape protection;
- current Policy, exact Action approval, and WorkspaceGrant authority;
- existing EffectCoordinator and durable idempotency;
- typed Tool outcome and bounded safe errors;
- automatic Artifact registration and existing Desktop Artifact presentation;
- restart recovery by postcondition digest inspection;
- explicit `uncertain` / manual-attention behavior when the filesystem no longer
  proves one safe outcome.

## 4. Explicit Non-Goals

WFW v1 does not implement:

- binary bytes, Base64 file payloads, or arbitrary encoding selection;
- delete, move, rename, chmod, execute, shell, or process launch;
- cross-Workspace writes;
- multi-file atomic transactions or rollback of earlier Tool Calls;
- append, patch, seek, partial-range writes, or streaming writes;
- recursive directory copy;
- HTML-specific generation, rewriting, sanitization, bundling, or asset fetch;
- network access or remote image/resource resolution;
- hidden-file or hidden-directory writes;
- parent-directory creation;
- parent-directory fsync or power-loss durability guarantees;
- backup restore UI or a `restore_previous` Tool;
- bypassing Tool Runtime, TaskCapabilityLock, authorization, approval,
  EffectCoordinator, or the trusted Worker;
- direct final-target `fs.writeFile` from Core, Main, Preload, or Renderer.

The writer treats HTML as UTF-8 text. Preview remains owned by the existing
APV-1C sandbox and its deny-by-default CSP.

## 5. Model-Visible Input

The model-visible schema remains small and does not expose private authority or
recovery material.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["relativePath", "content"],
  "properties": {
    "relativePath": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1024,
      "description": "Target path relative to the Task workspace. Absolute paths and hidden path segments are rejected."
    },
    "content": {
      "type": "string",
      "maxLength": 262144,
      "description": "Exact UTF-8 text to write. RoboThree does not normalize line endings or rewrite HTML."
    },
    "mode": {
      "type": "string",
      "enum": ["create_new", "replace_existing"],
      "default": "create_new"
    },
    "expectedPreviousSha256": {
      "type": "string",
      "pattern": "^sha256:[0-9a-f]{64}$",
      "description": "Required only for replace_existing and must match the current target bytes."
    }
  }
}
```

Cross-field rules are enforced by the Core parser and Worker parser:

- omitted `mode` means `create_new`;
- `create_new` forbids `expectedPreviousSha256`;
- `replace_existing` requires `expectedPreviousSha256` plus a Core-derived,
  exact WFW Artifact ownership proof;
- `idempotencyKey`, `requestDigest`, `workspaceGrantId`, `workspaceRoot`, real
  paths, temporary paths, lock paths, Artifact IDs/ownership proofs, approval
  decisions, and limits are never model-visible;
- Core generates `idempotencyKey` from durable Task and Tool Call identity;
- Workspace authority comes only from the Task's exact capability lock.

WFW v1 does not add a text read Tool. Replacement is available only when the
caller already has an exact prior digest from a previous WFW outcome, Artifact
fact, or another authorized read path. Missing knowledge of the digest must not
be replaced by a blind overwrite.

The WFW v1 product guarantee is therefore limited to creating a new file and
providing safe replacement when Core can prove that the current file is the
exact WFW-generated Artifact revision. The caller must also already possess the
current text through the active conversation or another authorized read path;
an Artifact identity and SHA-256 prove provenance/version, not file content.
Editing an arbitrary pre-existing Workspace text file, or reconstructing its
content from a digest, is not a WFW v1 closure criterion. A general text
read/stat capability requires a separate plan and authorization.

## 6. Text And Path Rules

### 6.1 Text

The private writer must:

- reject unpaired UTF-16 surrogate code units before UTF-8 encoding;
- reject NUL characters;
- encode without a BOM;
- preserve all other characters, whitespace, line endings, and final newline
  exactly;
- compute SHA-256 over the final UTF-8 bytes;
- cap `content` at 256 KiB after UTF-8 encoding;
- never place content, snippets, or generated bytes in logs, audit summaries,
  stderr, safe errors, or Desktop metadata.

The 256 KiB limit stays below the current private Worker frame budget and the
existing bounded HTML preview budget. Raising it requires a separate transport
and preview review.

### 6.2 Relative Path

The writer must reject:

- absolute POSIX, UNC, or drive-letter paths;
- URL-like paths, backslashes, NUL, empty segments, `.`, and `..`;
- any segment beginning with `.`;
- targets ending in `.prev`;
- RoboThree temporary/lock naming prefixes;
- a path over 1024 UTF-8 bytes, a segment over 255 UTF-8 bytes, or depth over
  32 segments;
- targets whose parent or final entry is a symlink;
- existing target or backup entries with more than one hard link;
- any real path that is not contained by the exact WorkspaceGrant root.

Unknown visible file extensions are allowed because this is a general text
writer. The file is still created with mode `0600`, never receives an executable
bit, and is never executed by WFW.

Kernel Alpha rejects hidden path segments as a conservative policy. This is not
a permanent structural limitation of the capability identity: a future policy
review may authorize selected hidden files such as `.gitignore`, but WFW v1 does
not enable them.

### 6.3 Parent Directory

Every parent must already exist as a real directory contained by the exact
WorkspaceGrant. A missing or invalid parent fails as `invalid_path`; the Worker
may retain `parent_missing`, `parent_not_directory`, or `parent_symlink` as a
private diagnostic reason. The writer does not create or clean up directories.
Parent creation is deferred to WFW-H1 or a separately governed directory Tool.

## 7. Publication Semantics

The trusted implementation lives in the existing Document Worker process as a
private `TextFileWriterAdapter`. This reuses the current isolated Tool backend,
NDJSON protocol, process lifecycle, and fault-injection strategy without adding
a new service or dependency. The capability remains a Workspace Tool in the
Core Registry; the Worker name does not enter the Tool contract.

The writer must not call `writeFile` on the final target. It writes a same-parent
temporary file with `O_CREAT | O_EXCL | O_WRONLY`, mode `0600`, then fsyncs the
file before publication.

### 7.1 `create_new`

```text
validate grant and path
-> validate existing parents
-> confirm target missing
-> write same-parent temp
-> fsync temp
-> link(temp, target) with no-clobber behavior
-> read back target and verify new SHA-256/size
-> unlink temp
```

If the target exists before publication, return `target_exists`. No existing
file may be replaced in `create_new` mode.

### 7.2 `replace_existing`

Replacement uses one sibling backup:

```text
target: <relativePath>
backup: <relativePath>.prev
```

Frozen order:

```text
acquire RoboThree advisory lock for target + backup
-> validate target as one regular single-link file
-> hash target and compare expectedPreviousSha256
-> validate backup as missing or one regular single-link file
-> write/fsync new-target temp
-> copy exact old target bytes to backup temp and fsync
-> atomically rename backup temp to .prev
-> revalidate target structure and old SHA-256
-> atomically rename new-target temp to target
-> verify target=new SHA-256 and .prev=old SHA-256
-> release lock and clean temporary files
```

The existing `.prev` is atomically replaced. WFW never creates `.prev.prev` and
never registers `.prev` as a separate Artifact.

Node does not provide a portable atomic compare-and-replace primitive against
arbitrary external writers. WFW therefore follows the existing DWO baseline:
advisory lock plus immediate digest recheck plus postcondition verification.
This is best-effort stale-write protection, not an atomic cross-process CAS.
WFW rejects external changes observed before the final digest recheck. An
uncooperative external editor can still write between that recheck and the
final rename, and WFW v1 cannot guarantee detection of every write in that
residual TOCTOU window. The limitation is documented and accepted for Kernel
Alpha; OS-specific cross-process locking or stronger CAS belongs to WFW-H1.

File fsync, close, same-parent link/rename, and read-back verification provide
the WFW v1 process-crash boundary. Parent-directory fsync and explicit
power-loss durability testing are deferred to WFW-H1. Documentation, tests, and
user-facing copy must not describe WFW v1 as power-loss durable.

## 8. Policy And Approval

Authorization uses the existing exact WorkspaceGrant and current Tool policy.
WFW v1 replacement additionally requires a Core-private ownership proof derived
from a durable Tool-generated Artifact; the model and Renderer cannot provide or
override it.

| Mode | Required provenance | Resource operation | Risk facts | Default approval |
| --- | --- | --- | --- | --- |
| `create_new` | target missing | `create` | `routine_file` | Policy may allow without a prompt |
| `replace_existing` | exact WFW-generated Artifact revision | `modify` | `routine_file` | Policy may allow without a prompt |

Core may hydrate the replace ownership proof only when all of these durable
facts match the current request:

- source capability is exactly `tool.workspace.file.write_text`;
- WorkspaceGrant identity and normalized relative path match;
- Artifact source SHA-256 equals `expectedPreviousSha256`;
- Artifact source is not deleted, and no newer durable WFW revision has replaced
  it for the same Workspace/path.

The ownership proof identity/digest enters the private Action and request digest
but is never model-visible. Missing, stale, ambiguous, or non-WFW provenance
fails closed. WFW v1 does not fall back to confirmation to overwrite an
arbitrary pre-existing user file.

Approval is bound to the canonical Action digest, which includes:

- normalized relative path;
- content SHA-256, not content text;
- mode;
- `expectedPreviousSha256` when replacing;
- private WFW ownership proof identity/digest when replacing;
- exact capability, binding, and adapter revisions.

WFW v1 does not force a confirmation for every safe replacement of a
WFW-generated Artifact. Existing Policy may allow routine create/modify Actions
or deny them. Support for overwriting pre-existing user files would require a
separate scope with `destructive_file` and exact single-Action confirmation; it
is not authorized by this plan.

Authorization is reevaluated before prepare, before dispatch, and after user
confirmation through the existing `currentContext()` path. A revoked or changed
WorkspaceGrant invalidates the action.

## 9. Idempotency And Request Digest

Core generates:

```text
idempotencyKey = workspace-text:<taskId>:<toolCallId>
```

The canonical request digest covers:

```text
capabilityId
idempotencyKey
workspaceGrantId
normalized relativePath
mode
contentSha256
expectedPreviousSha256?
ownedArtifactProofDigest?
limits revision
```

The EffectAttempt persists the exact Action and request digest under the current
bounded Task persistence rules. The Worker receives `idempotencyKey` and
`requestDigest` only over its private protocol and recomputes the digest before
touching the filesystem.

Rules:

- same key + same request digest replays the same durable effect;
- same key + different request digest returns `effect.idempotency_conflict`;
- Worker request digest mismatch fails before temp creation;
- no idempotency key is accepted directly from the model or Renderer.

## 10. Crash Recovery And `uncertain`

WFW uses `query_then_retry`. The private Tool backend must gain a bounded
postcondition inspection operation; the model does not see this operation.

WFW v1 fault injection is limited to four decision-relevant windows:

1. before temporary-file creation;
2. after the temporary file is fully written and fsynced but before publication;
3. after target publication but before durable Observation commit;
4. during replacement when target and `.prev` evidence no longer prove one
   consistent outcome.

The implementation may have more internal steps, but exhaustive injection at
every step belongs to WFW-H1. These four windows must close as safe retry,
recovered success, or `uncertain` without reporting an unproved success.

Recovery classification:

| Filesystem evidence | Decision |
| --- | --- |
| create target missing | `not_found`, safe retry |
| create target matches new digest and size | recovered success |
| create target exists with another digest/type | `unknown` -> `uncertain` |
| replace target still matches old digest | safe retry after complete revalidation |
| replace target matches new digest and `.prev` matches old digest | recovered success |
| replace target matches new digest but backup missing/wrong | `unknown` -> `uncertain` |
| replace target/backup type, link, path, or digest is ambiguous | `unknown` -> `uncertain` |

Recovered success must recreate the same bounded Observation and Artifact facts
from the persisted Action plus inspected SHA-256/size. Recovery never reads file
content into Renderer or model context.

An uncertain effect:

- remains durable and visible as manual attention;
- does not automatically retry;
- does not register a success Artifact;
- shows a safe message such as “文本文件写入结果无法确认，请在工作区中核对后重试。”;
- never displays real Workspace root, temporary path, lock path, stack, file
  content, or raw OS error.

## 11. Typed Outcome And Errors

Success output:

```text
status: created | replaced | replayed
relativePath
mode
sha256
byteSize
mediaType
previousSha256?       # replace only
backupCreated         # true for successful replace
warnings[]            # bounded safe enum-backed copy only
```

The output never includes absolute paths, content, temp/lock/backup real paths,
Workspace authority, approval identity, or internal Task/Effect IDs.

Required detail codes:

```text
invalid_arguments
invalid_path
path_escape
target_exists
target_missing
previous_digest_mismatch
policy_denied
user_rejected
write_failed
recovery_uncertain
cancelled
timed_out
```

WFW should map these through existing RuntimeError categories and Worker error
envelopes. The Worker may retain finer private diagnostic reasons for tests and
safe internal classification, but those reasons do not become a larger public
error taxonomy. WFW must not add public Desktop error codes unless
implementation proves the existing safe envelope cannot express a required
state.

## 12. Artifact And Desktop Behavior

A successful write automatically creates a Tool-generated Artifact from the
durable Observation. It does not call the manual Artifact registration command.

Media type and kind are derived from the final visible extension:

| Extension | mediaType | Artifact kind | Preview |
| --- | --- | --- | --- |
| `.html`, `.htm` | `text/html` | `html` | existing APV-1C sandbox |
| `.md`, `.markdown` | `text/markdown` | `markdown` | existing bounded Markdown preview |
| `.json` | `application/json` | `text` | bounded text preview |
| `.css` | `text/css` | `text` | bounded text preview |
| `.csv` | `text/csv` | `text` | bounded text preview |
| other visible names | `text/plain` | `text` | bounded text preview |

No HTML bytes may be inserted with `innerHTML` or `v-html`. HTML content goes
only to the existing tokenized 127.0.0.1 APV-1C sandbox with empty iframe
sandbox and deny-by-default CSP.

Desktop Task Detail and the right Artifact panel show:

- display filename;
- created or replaced status;
- byte size;
- “已保留上一版本备份” for successful replacement;
- preview/open-location actions already supported by Artifact capabilities.

They do not show content digests by default, `.prev` as a separate result,
internal capability revisions, Effect IDs, or real paths.

## 13. Implementation Batches

### WFW-0 — Plan Freeze

Docs only:

- review and freeze this plan;
- confirm canonical capability ID and limits;
- confirm use of existing Document Worker and APV paths;
- require separate authorization for every implementation batch; WFW-2 and
  WFW-3 remain coding gated after the WFW-1 authorization.

### WFW-1 — Private Writer Lite

Expected scope:

```text
services/document-worker/src/text/**
services/document-worker/src/handlers/**
services/document-worker/src/protocol/**
services/document-worker/tests/text/**
```

Deliver:

- strict parser and UTF-8 encoder;
- path/parent guard;
- create and replace publication;
- `.prev` backup;
- request digest verification;
- postcondition inspector;
- fault injection at the four WFW v1 crash windows;
- no Tool Registry activation.

### WFW-2 — Tool Runtime Activation

Expected scope:

```text
services/core/src/registry/**
services/core/src/application/**
services/core/src/adapters/tool/**
services/core/src/bootstrap/**
services/core/tests/**
```

Deliver:

- model-visible Registry descriptor;
- assignment to `agent.general` and explicitly entitled Agents;
- strict argument parsing and private authority hydration;
- Core-private WFW Artifact ownership proof hydration for replace;
- `routine_file` create/owned-modify policy facts without mandatory replace
  confirmation;
- EffectCoordinator `query_then_retry` integration;
- Artifact indexing from durable Observation;
- restart recovery and uncertain classification.

This batch is integration into existing infrastructure, not authorization to
replace WorkspaceGrant, Policy, EffectCoordinator, Artifact, or durable Task
architecture. If a public Contract, migration, or new recovery subsystem is
required, WFW-2 stops and returns to document review.

No migration or public Contract change is currently expected. Discovery of one
stops the batch for separate review.

### WFW-3 — Desktop Product E2E

Expected scope:

```text
apps/desktop/src/renderer/presentation/**
apps/desktop/src/renderer/pages/workbench/**
apps/desktop/tests/**
scripts/run-wfw*.mjs
governance and QA documents
```

Deliver:

- Tool activity and typed safe error presentation;
- text/Markdown/HTML Artifact display using existing preview paths;
- real Electron E2E:
  prompt -> Tool Call -> file -> Artifact -> preview;
- restart tests for recovered success and uncertain state;
- no new file-picker, IPC, or Renderer filesystem access.

WFW-3 must not add a WFW-specific Desktop results system. It verifies and, only
where necessary, minimally wires the existing Tool activity, Artifact, and
preview presentation.

### WFW-H1 — Deferred Production Hardening

WFW-H1 is not authorized by WFW v1 and does not block WFW v1 closure. It may be
planned after the real product loop has been exercised. Candidate scope:

- optional parent-directory creation and crash cleanup;
- parent-directory fsync and power-loss durability evidence;
- exhaustive publication-boundary fault injection;
- broader symlink, hard-link, TOCTOU, long-path, large-file, and platform matrix;
- stronger OS-specific cross-process locking or compare-and-replace semantics;
- finer private filesystem diagnostics where operational evidence requires it;
- expanded Windows matrix for FAT/exFAT, network shares, OneDrive, junctions,
  long paths, and file-sharing edge cases;
- selected hidden-file policy and backup restore UX.

## 14. Test Matrix

### Writer

- exact UTF-8 bytes, Chinese text, emoji, CRLF/LF preservation;
- unpaired surrogate, NUL, and byte-limit rejection;
- absolute, traversal, backslash, URL, hidden, `.prev`, deep, and long paths;
- parent missing and parent symlink rejection;
- create no-clobber;
- replace exact digest;
- stale digest leaves target and `.prev` unchanged;
- arbitrary pre-existing or non-WFW files cannot enter replace through a
  model-supplied path/digest;
- target/backup symlink and hard-link rejection;
- old `.prev` replaced by exactly one new backup;
- temp and lock cleanup across all normal failures.

### Effect And Recovery

- same idempotency key and same digest replays;
- same key and different digest conflicts;
- crash before temp creation;
- crash after the temp is fully written/fsynced but before publication;
- crash after target publication but before Observation commit;
- replace recovery where target and `.prev` evidence disagree;
- successful digest inspection recovers once;
- ambiguous digest/type becomes uncertain and never auto-retries;
- WorkspaceGrant revocation before dispatch invalidates the effect.

### Policy

- create uses exact `create` access;
- replace uses exact `modify` access and Core-proven WFW Artifact ownership;
- replace carries `routine_file` and does not force confirmation by default;
- missing/stale/non-WFW ownership proof performs no write and does not fall back
  to destructive confirmation;
- changed Action, content digest, expected digest, or ownership proof invalidates
  the prepared effect;
- no cross-Workspace target can be hydrated.

### Artifact And Desktop

- `.html` becomes `kind=html`, `mediaType=text/html`;
- `.md` and text kinds map correctly;
- Artifact source digest equals published file digest;
- `.prev` is not indexed as another Artifact;
- HTML preview uses APV-1C only;
- Task panel shows safe created/replaced/uncertain language;
- no content, root path, temp path, stack, authority, or digest leaks into DOM;
- Core restart preserves exactly one Artifact and does not duplicate a Tool
  Result.

### Static Boundaries

- model schema contains no `workspaceRoot`, `workspaceGrantId`, `idempotencyKey`,
  `requestDigest`, approval, temp, lock, or limits field;
- Renderer/Preload contain no `fs`, `path`, `ipcRenderer`, `innerHTML`, or
  `v-html` additions;
- writer contains no network, process execution, shell, SQLite, or Credential
  access;
- Core/Main do not write final target bytes;
- no dependency or lockfile change;
- no skipped, todo, or empty assertions.

## 15. Validation Gates

Each authorized coding batch must run its focused tests plus:

```text
pnpm --filter @robothree/document-worker build
pnpm --filter @robothree/core build
pnpm --filter @robothree/desktop build
pnpm run audit:dtp4
pnpm run lint
pnpm run check
pnpm install --frozen-lockfile --offline
git diff --check
```

Compare before/after:

- `pnpm-lock.yaml` SHA-256;
- migration maximum;
- public Contract snapshots;
- package versions outside the authorized closure window.

WFW-3 additionally requires a real Electron E2E with:

1. create `index.html` in the default Workspace;
2. Artifact appears in the current conversation;
3. APV-1C preview opens without script, network, navigation, or Node access;
4. while the active conversation still has the current text, replace the file
   using the exact prior SHA-256 and Core-proven WFW Artifact ownership;
5. verify target is new content and `index.html.prev` is exact old content;
6. restart Core and confirm the durable Tool Result and Artifact are not
   duplicated;
7. inject an ambiguous post-publication state and confirm manual attention.

WFW-3 closure also requires one real Windows local-NTFS smoke/E2E on supported
Desktop hardware. It must cover `create_new`, owned `replace_existing`, exact
`.prev`, Artifact display, Core restart, and durable recovery. The expanded
Windows/filesystem matrix remains deferred to WFW-H1, but WFW may not close on
macOS-only evidence.

## 16. Estimate

Suggested concentrated engineering estimate:

| Batch | Estimate |
| --- | --- |
| WFW-0 Revision 1.1 focused review | 0.25 to 0.5 day |
| WFW-1 Lite writer, backup, four crash windows | 1.5 to 2 days |
| WFW-2 Lite Registry, policy, Effect recovery, Artifact | 1 to 1.5 days |
| WFW-3 Lite real Electron E2E and closure | 0.5 to 1 day |
| Total | 3 to 5 concentrated engineering days |

The estimate is driven by replace/recovery correctness, not UTF-8 encoding.
If WFW-2 cannot reuse the current Registry, Policy, EffectCoordinator, and
Artifact seams within this range, implementation stops and identifies the exact
infrastructure gap rather than expanding WFW into a new subsystem.

## 17. Closure Criteria

WFW closes only when all of these are true:

- Agent-visible Tool is registered under the canonical capability ID;
- `agent.general` can create a real HTML file in the default Workspace;
- create and replace obey exact WorkspaceGrant and policy decisions;
- replace requires exact prior digest and creates one verified `.prev` backup;
- replace requires Core-proven WFW Artifact provenance and does not claim that a
  digest provides the current text content;
- external-writer protection is documented as best effort across the final
  digest-check/rename TOCTOU window;
- the four WFW v1 crash windows have deterministic recovered-success,
  safe-retry, or uncertain outcomes;
- Artifact registration and Desktop preview are real, durable, and pathless;
- no direct filesystem bypass exists outside the trusted Worker;
- focused, full, offline, boundary, and Electron E2E gates pass;
- a real Windows local-NTFS create/replace/`.prev`/restart smoke passes;
- independent QA passes and the user formally accepts closure.

Until then:

```text
WFW Overall: WFW-1 INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED /
WFW-2 INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED /
WFW-3 DETAILED PLAN DOCUMENT REVIEW PENDING / CODING GATED /
WFW-H1 CODING GATED
```
