# APV-3C Artifact Lifecycle Hardening / UX Polish Development Plan

> Owner: Codex 5.6
> Status: APV-3C PASS/CLOSED (DOCS-ONLY)
> Date: 2026-08-06

## 1. Current Gate

```text
DTP-0 -> DTP-4: PASS/CLOSED
DWE-0 -> DWE-3: PASS/CLOSED
APV-0 -> APV-3B: PASS/CLOSED
DWO-0 -> DWO-3: PASS/CLOSED
MAR-0 -> MAR-1B: PASS/CLOSED

APV-3C: PASS/CLOSED (DOCS-ONLY)

bulk registration: GATED
drag/drop path ingestion: GATED
overwrite extension / bulk overwrite: GATED
OS Sandbox: GATED
formal installer: GATED
```

APV-3C is a Desktop/Application hardening batch for Artifact lifecycle UX after
APV-3A record tombstone/restore, APV-3B source file delete to OS Trash, and MAR
manual artifact registration. It is not a Tool, does not register
`artifact.preview`, `artifact.delete`, or `tool.artifact.*`, and does not call
Document Worker.

## 2. Product Decision

APV-3C should only improve safety, clarity, and lifecycle consistency for
already implemented Artifact operations. It must not introduce a new file
authority path or a new destructive capability.

The goal is to make Artifact states legible and recoverable:

- hidden/dismissed/deleted/sourceDeleted records must be visually distinct;
- manual workspace-file artifacts and task-produced artifacts must behave
  consistently where their authority model overlaps;
- unsupported, missing, blocked, deleted, and sourceDeleted preview/open/export
  states must be explicit and stable;
- audit and recovery copy must tell the user what happened without leaking paths
  or private file facts.

## 3. Scope Freeze

Allowed in APV-3C:

- Desktop Renderer presentation polish for existing Artifact lifecycle states;
- stricter disabled-state mapping for preview/open/export/delete/restore buttons;
- safer user-facing copy for deleted/sourceDeleted/manual-attention states;
- metadata-only audit summaries derived from existing projections;
- tests for lifecycle state matrices across task-produced and manual artifacts;
- additional platform smoke tests for APV-3B OS Trash postconditions where
  supported by the local test environment;
- documentation updates and QA matrix tightening.

Forbidden in APV-3C:

- permanent unlink, rename, move, overwrite, patch, append, import, or bulk
  filesystem operations;
- new public Contracts unless coding proves the existing projection cannot
  express required state safely;
- new Document Worker parser/writer calls;
- any model-visible Artifact Tool or Tool Registry entry;
- accepting path, root, `workspaceRoot`, `rootRealPath`, `relativePath`,
  `fileSha256`, workbook, HTML, parser output, or drag/drop path from Renderer;
- broad drag/drop ingestion, folder registration, glob import, or recursive
  import;
- OS-level sandbox claims;
- formal packaging or installer changes.

If APV-3C needs a new Desktop Local Contract field to represent a state that
cannot be safely derived today, coding must stop for Contract review before
modifying `packages/contracts/**`.

## 4. State Matrix

APV-3C must freeze one visible behavior matrix:

```text
available + not deleted:
  preview/open/export allowed when projection supports it
  record delete allowed
  source delete allowed only when APV-3B authority and confirmation apply

dismissed:
  hidden from default panel list
  restorable through existing lifecycle restore
  source file untouched

deleted:
  omitted from default panel list unless show-deleted is enabled
  preview/open/export disabled
  restore allowed when sourceDeleted is false
  source file untouched

sourceDeleted:
  preview/open/export disabled
  record restore unavailable or explicitly downgraded to record-only if already
  supported by existing Contracts
  label must say "Source moved to Trash" or equivalent safe copy

missing/blocked/unsupported:
  no filesystem side effect
  action button disabled with typed safe reason
```

APV-3C must not change Artifact identity. `artifactId`, `sourceKind`,
`sourceId`, `sourceDigest`, and existing lifecycle revision semantics remain the
authority.

## 5. UX Copy Requirements

Renderer copy must be safe and bounded:

- no `workspaceRoot`, `rootRealPath`, absolute path, digest, old digest,
  workbook content, HTML content, or private request digest;
- relative display names only when already present in safe projection;
- source deletion copy must distinguish "record hidden/deleted" from "source
  moved to Trash";
- restore copy must not promise source restoration when `sourceDeleted=true`;
- conflict/uncertain states must ask for manual attention without suggesting
  automatic destructive retry.

Suggested labels:

```text
Deleted record
Source moved to Trash
Preview unavailable
Open unavailable
Restore record
Manual attention required
```

Exact Chinese/English UI copy should follow existing Desktop wording and should
be tested as projection strings, not as raw DOM snapshots.

## 6. Authority Boundary

APV-3C must keep the existing authority split:

```text
Renderer:
  artifactId-only commands and safe projection rendering

Preload:
  strict Desktop Local schema parsing

Desktop Main:
  Main-only filesystem side effects and APV-2/APV-3B guards

Core:
  durable lifecycle records, projection, recovery state, and command replay
```

No APV-3C command may accept paths from Renderer. Any file action continues to
resolve through `artifactId -> durable fact -> active WorkspaceGrant -> Main
realpath guard`.

## 7. Suggested Implementation Batches

APV-3C.0: Plan freeze / docs-only closure

- finalize state matrix and UX copy;
- identify whether existing Contracts are sufficient;
- no production code.
- independent review concluded no production hardening is currently justified.

Estimate: 0.5 to 1 concentrated engineering day.

APV-3C.1: Projection and renderer hardening

- normalize disabled-state decisions in one presentation helper;
- add tests for available/dismissed/deleted/sourceDeleted/missing/blocked/
  unsupported combinations;
- update Artifact Panel copy and action availability.

Estimate: 1 to 2 concentrated engineering days.

APV-3C.2: Platform smoke and recovery copy

- add focused tests for APV-3B Trash postcondition summaries where supported;
- add regression tests for manual artifacts after source delete;
- verify no path/digest leakage in task detail, catalog, preview, and lifecycle
  receipts.

Estimate: 1 to 2 concentrated engineering days.

Total APV-3C estimate: 2.5 to 5 concentrated engineering days, excluding
independent QA, user review, and rework.

APV-3C.0 review found no production hardening is currently needed, so APV-3C
closes as docs-only. The state matrix remains a reference document for later
bulk registration or drag/drop path ingestion.

## 8. Allowed Modification Scope

APV-3C.0 docs-only:

```text
docs/development/apv/**
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

APV-3C.1/APV-3C.2 implementation, if separately authorized:

```text
apps/desktop/src/renderer/**
apps/desktop/src/shared/**
apps/desktop/src/preload/**
apps/desktop/src/main/**
apps/desktop/tests/**
services/core/src/application/**
services/core/tests/**
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
apps/desktop/package.json
services/core/package.json
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/apv/**
```

`packages/contracts/**` is a hard stop unless APV-3C.0 review explicitly
approves an additive Contract change. If that happens, Contracts tests and
contract leak tests become mandatory gates.

Forbidden unless separately authorized:

```text
services/document-worker/**
services/central-service/**
pnpm-lock.yaml
root package.json
root tsconfig.json
Tool Registry
Default Agent catalog
Document Worker parser/writer code
formal installer packaging
OS Sandbox implementation
bulk registration
drag/drop path ingestion
overwrite extension / bulk overwrite
```

## 9. QA Matrix

APV-3C.1/APV-3C.2 must prove:

- lifecycle state matrix behavior is deterministic;
- task-produced artifacts and manual workspace-file artifacts have consistent
  action availability where allowed;
- deleted records do not preview/open/export;
- sourceDeleted records do not pretend restore can recover the source file;
- APV-3B source delete postcondition copy is stable;
- manual artifacts with missing/replaced source fail closed without path leaks;
- Renderer/Preload/Shared do not contain `rootRealPath`, `workspaceRoot`,
  `fileSha256`, `confirmedOldSha256`, raw HTML, workbook content, or private
  request digest;
- no new `artifact.*` Tool or Tool Registry entry exists;
- Document Worker and Central production code remain unchanged;
- lockfile, root package, and root tsconfig remain unchanged.

Required commands:

```bash
CI=true pnpm --config.verify-deps-before-run=false run build
CI=true pnpm --config.verify-deps-before-run=false exec vitest run <focused APV-3C tests>
CI=true pnpm --config.verify-deps-before-run=false exec vitest run packages/contracts/tests
CI=true pnpm --config.verify-deps-before-run=false exec vitest run services/core/tests
CI=true pnpm --config.verify-deps-before-run=false exec vitest run apps/desktop/tests
CI=true pnpm --config.verify-deps-before-run=false exec vitest run services/document-worker/tests
CI=true pnpm --config.verify-deps-before-run=false run lint
CI=true pnpm --config.verify-deps-before-run=false run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
CI=true pnpm --config.verify-deps-before-run=false run check
```

## 10. Closure Criteria

APV-3C closed docs-only because:

- APV-3C.0 review found no P0-P3 driver for production coding;
- the state matrix is preserved as a reference artifact;
- DEVELOPMENT-LOG, CHANGELOG, README, and the APV plans agree on status;
- all gated items remain gated unless separately authorized.
