# DFE-RUN-1 Repair 2 Implementation Report

## Status

`IMPLEMENTED / DEVELOPER VERIFICATION PASS / PRODUCT RE-ACCEPTANCE AND INDEPENDENT QA PENDING`

This report does not close DFE-RUN-1 and does not claim packaging or release readiness.

## Goal

Align the Desktop product surface with the accepted client prototype in two areas:

1. make New Task a conversation-first AI workbench with one unified composer;
2. make Robot, Skill, and Tool details real child pages reached from the Intelligence catalog.

## Implemented

- New Task uses a centered 900px work surface and one composer containing the task textarea, workspace, attachment, approval,
  selected-resource, scheduling, and send actions.
- Robot, model, Max, Skill, Knowledge, and attachment details remain available but are hidden until the user opens Intelligent
  Scheduling.
- Capability categories and task starters are lightweight controls below the composer instead of large configuration cards.
- Robot, Skill, and Tool detail routes load `IntelligenceDetailPage.vue`; direct Robot/Tool URLs load real Catalog detail and do not
  depend on the list page's first pagination result.
- Skill detail remains explicitly unavailable until a real Skill Catalog exists. No fixture data is shown in production.
- Empty pinned-task and workspace groups do not occupy the sidebar.

## Preserved Behavior

- Missing or unavailable models remain fail-closed.
- A vanished selected Agent is not silently replaced on later refreshes.
- Skill and Knowledge selection remains explicit, including a durable empty Renderer selection.
- The Renderer continues to use existing adapters and public safe projections; no path, authority, credential, or request digest is
  introduced.

## Scope

Production changes are limited to `apps/desktop/src/renderer/**`. Tests are under `apps/desktop/tests/**`. Shared changes only update
the Desktop development version, DTP-4 audit expectation, and governance records.

The batch does not modify Main, Preload, IPC, Contracts, Core, Central, Document Worker, SQLite migrations, dependencies, or the
lockfile.

## Verification

- Focused component/model/router tests: `6 files / 39 tests PASS`.
- Desktop TypeScript, Preload, and Renderer production build: PASS.
- DTP-4 packaging audit: PASS.
- Real Electron visual inspection: 1180x760 and 900x600, New Task collapsed/expanded scheduling and Intelligence list, no horizontal
  overflow observed.
- Full lint reaches the existing Architecture boundary finding in `settings-adapter.ts` for the `rootRealPath` sanitization pattern.
  This file and rule are outside this repair and were not changed or weakened.

## Remaining Gate

Product re-acceptance and independent code QA are required before this repair can close.
