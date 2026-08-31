# AFE-6C Admin Evidence Hardening Plan

Status: DOCUMENT PLAN ONLY / CODING GATED
Revision: 1.1 focused P3 terminology and execution-precision revisions applied
Date: 2026-08-27
Owner: Codex 5.6

## 0. Scope

AFE-6C is a narrow Admin Console evidence-hardening batch. It closes the non-blocking AFE-6B QA observation that `scan:static` can pass when `dist/**` or `dist-integration/**` is missing.

This batch does not add product capability, routes, pages, Adapter methods, API integration, mutation, Tool activation, TGM, Knowledge Provider, production identity, or Desktop consumption.

## 1. Upstream Facts

- AFE-6A Admin Read-only Experience Closure is PASS/CLOSED.
- AFE-6B Admin Browser / Visual / Accessibility Evidence Closure is PASS/CLOSED.
- AFE-6B independent QA recorded P3-1: `apps/admin-console/scripts/static-scan.mjs` returns an empty bundle scan when generated bundle directories are absent, so the standalone command can exit 0 without proving production and integration bundles were scanned.
- AAPI-0.4 evidence remains the Admin Adapter boundary reference: 12 read-only methods, 0 mutation methods, production `AdminApiAdapter` unreachable, readiness flags false.
- Current Admin production app remains Vue 2.7.16, Vue Router 3.6.5, Vite 6.4.3, `@vitejs/plugin-vue2` 2.3.4, Vitest 4.1.10, Vue Test Utils 1.3.6.

## 2. Goals

G-01. Make `scan:static` produce explicit bundle evidence for production and integration builds.

G-02. Fail `scan:static` when required bundle roots are missing or contain zero scanned bundle files.

G-03. Preserve existing sensitive-source, page-text, production-bundle, integration-bundle, positive-injection, and false-positive behavior.

G-04. Add tests proving missing bundle roots cannot silently pass.

G-05. Keep AAPI-0.4 evidence checks unchanged: digest, 12 read-only methods, mutation count 0, production Adapter unreachable, readiness false.

G-06. Keep authored source changes inside `apps/admin-console/**`.

## 3. Non-Goals

- No UI, layout, route, page, component, or copy redesign.
- No real-browser screenshot, Playwright, axe-core, or pixel baseline.
- No new dependencies.
- No Adapter Contract changes.
- No backend, Desktop, Core, Central, Main, Preload, IPC, migration, or root workspace dependency changes.
- No mutation, save, create, publish, install, sync, test-success, upload, credential entry, or production identity flow.
- No LocalStorage, SessionStorage, IndexedDB, or frontend persistence.

## 4. File Boundaries

Allowed future coding scope:

- `apps/admin-console/scripts/static-scan.mjs`
- `apps/admin-console/scripts/static-scan.mjs.d.ts`
- `apps/admin-console/tests/static/**`
- `apps/admin-console/package.json` version-only closeout if coding is accepted
- `apps/admin-console/AFE-6C-*IMPLEMENTATION-REPORT.md` or equivalent Admin-local implementation report if required

Allowed documentation scope during plan/review:

- `docs/development/frontend/AFE-6C-ADMIN-EVIDENCE-HARDENING-PLAN.md`

Forbidden:

- `packages/contracts/**`
- `services/core/**`
- `services/central-service/**`
- `apps/desktop/**`
- `apps/admin-console/src/**` unless a future reviewer explicitly requests a source-level scan marker fix
- `apps/desktop/src/main/**`
- `apps/desktop/src/preload/**`
- IPC, migration, root `package.json`, root `pnpm-lock.yaml`, root TypeScript/Vite/ESLint configuration
- Version, CHANGELOG, README, or DEVELOPMENT-LOG closeout before implementation QA and user acceptance

Generated outputs:

- `apps/admin-console/dist/**`
- `apps/admin-console/dist-integration/**`
- `artifacts/aapi04/evidence.json`

These are rebuildable gate outputs. They are not authored source changes and must not be committed as implementation source.

## 5. Proposed Static Scan Contract

`scanStaticSources()` should keep its default no-argument production behavior and may add injectable options for tests:

```ts
type StaticScanOptions = {
  rootDir?: string;
  bundleRoots?: {
    production: string;
    integration: string;
  };
};
```

`rootDir` defaults to the Admin package root. `bundleRoots.production` defaults to `dist`; `bundleRoots.integration` defaults to `dist-integration`. The CLI must continue to call `scanStaticSources()` with no arguments so the closure gate always validates the real generated Admin bundles. Tests may call `scanStaticSources({ bundleRoots })` with temporary roots to exercise missing and empty bundle behavior without renaming or deleting real build output. No CLI flag is required for this injection path.

`scanStaticSources()` should return the current fields plus deterministic bundle evidence:

```ts
type BundleScanEvidence = {
  root: 'dist' | 'dist-integration';
  exists: boolean;
  scannedFileCount: number;
  jsFileCount: number;
};

type StaticScanResult = {
  sourceViolations: StaticViolation[];
  bundleViolations: StaticViolation[];
  productionBundleViolations: StaticViolation[];
  positiveDetections: StaticViolation[];
  negativeFalsePositives: StaticViolation[];
  pageTextViolations: StaticViolation[];
  bundleEvidence: BundleScanEvidence[];
  missingRequiredBundleRoots: string[];
  emptyRequiredBundleRoots: string[];
};
```

The command-line `scan:static` gate must fail when:

- any current violation condition fails;
- `positiveDetections.length === 0`;
- `dist/**` does not exist;
- `dist-integration/**` does not exist;
- either required bundle root has zero scanned files;
- either required bundle root has zero JavaScript bundle files.

The scan output must print the new evidence so QA can distinguish "scanned and clean" from "nothing was scanned".

## 6. Gate Ordering

Because bundle scanning requires generated output, the canonical AFE-6C gate order is:

1. `pnpm --filter @robothree/admin-console typecheck`
2. `pnpm --filter @robothree/admin-console typecheck:negative`
3. `pnpm --filter @robothree/admin-console build`
4. `pnpm --filter @robothree/admin-console build:integration`
5. `pnpm --filter @robothree/admin-console test`
6. `pnpm --filter @robothree/admin-console scan:static`
7. `pnpm --filter @robothree/admin-console scan:deps`
8. `pnpm --filter @robothree/admin-console smoke:dev`

`scan:static` must not be treated as an independent source-only check in closure gates. If a future local-dev `--source-only` mode is added, it must print `mode: source-only`, skip all bundle conformance claims, and must not be used as AFE-6C acceptance evidence.

## 7. Testing Plan

Tests should avoid renaming or deleting real `dist/**` directories. Use `scanStaticSources({ bundleRoots })` with temporary scan roots for missing and empty bundle assertions.

Existing `apps/admin-console/tests/static/static-scan.admin.ts` must be adapted so its negative coverage does not depend on whether the package-level `test` script happens to run after `build`. The test suite should use injected temporary bundle roots for missing/empty negative cases, while the canonical closure command `pnpm --filter @robothree/admin-console scan:static` remains bound to the real `dist/**` and `dist-integration/**` outputs after `build` and `build:integration`.

Required tests:

- current happy path still passes after `build` and `build:integration`;
- result includes production and integration bundle evidence with nonzero scanned file counts;
- result includes production and integration JavaScript bundle counts with nonzero values;
- missing production bundle root is reported and causes CLI failure;
- missing integration bundle root is reported and causes CLI failure;
- empty production bundle root is reported and causes CLI failure;
- empty integration bundle root is reported and causes CLI failure;
- positive leaky fixture still produces expected detections;
- allowed fake/sentinel values still produce zero false positives;
- production bundle still does not expose `AdminApiAdapter`, `createAdminApiAdapter`, or `/admin/v1alpha1`;
- integration bundle may contain integration-only Admin API strings, but those must remain isolated from production bundle checks.

## 8. Security Boundaries

AFE-6C must preserve the existing sensitive information rules:

- no real or likely real API Key, Token, Credential, bearer material, private key, endpoint, stack trace, internal path, raw observation, Tool payload, prompt, or audit raw payload in source, page text, generated bundles, test snapshots, or QA evidence;
- Credential display remains enum-only: configured, missing, unavailable;
- ordinary errors must not use `JSON.stringify(error)` or expose `.stack`;
- pages and presentation logic must not call `fetch`, `XMLHttpRequest`, or direct HTTP clients;
- production bundle must not include integration-only `AdminApiAdapter` wiring;
- generated evidence must not include environment variables, filesystem secrets, cookies, or Authorization headers.

## 9. Evidence Matrix

| Evidence | What It Proves | What It Does Not Prove |
| --- | --- | --- |
| `scan:static` source scan | Authored Admin source has no forbidden sensitive or fake-success patterns | It does not prove runtime backend security |
| `scan:static` page text scan | Admin-visible page strings avoid forbidden fake success and sensitive strings | It does not prove product copy approval |
| Production bundle scan | Production build excludes integration-only Admin API adapter strings | It does not prove real browser rendering |
| Integration bundle scan | Integration build exists and can be scanned without leaking forbidden sensitive strings | It is not production bundle evidence |
| Missing/empty bundle tests | The scan cannot silently pass without generated output | They do not replace canonical build commands |
| AAPI-0.4 harness | Adapter method count and readiness evidence remain unchanged | It does not unlock production identity or mutation |

## 10. Workspace Gates

After coding, run:

1. `pnpm run harness:aapi0.4`
2. `pnpm --filter @robothree/desktop build`
3. `pnpm exec vitest run apps/desktop/tests`
4. `pnpm run check`

If Central gates are requested by reviewer and the default shell lacks JDK 21, use:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm run check:central:offline
```

`NOT RUN` must not be reported as `PASS`.

## 11. Acceptance Criteria

AFE-6C may be accepted only if:

- implementation stays inside the authorized `apps/admin-console/**` coding scope;
- no dependencies are added;
- root `pnpm-lock.yaml` digest remains unchanged unless a reviewer explicitly authorizes a shared dependency window;
- Admin package gates pass in the canonical order;
- `scan:static` fails deterministically for missing or empty required bundles;
- `scan:static` reports nonzero production and integration bundle file counts in the successful path;
- production bundle checks still prove integration-only Admin API adapter strings are absent;
- AAPI-0.4 evidence digest and method/readiness facts remain unchanged;
- `pnpm run check` passes or any external blocker is isolated with exact file ownership and failing command evidence.

## 12. Follow-On Boundaries

AFE-6C closing does not unlock:

- mutation;
- Tool activation;
- TGM;
- Knowledge Provider;
- production identity;
- AAPI-0.5;
- Desktop v2 consumption;
- real browser screenshot or axe automation;
- Admin CRUD pages.

Any one of those requires a separate plan, review, and authorization.

## 13. Estimated Effort

- Implementation: 0.5 to 1 day.
- Focused tests: 0.5 day.
- Full gates and report: 0.5 day.

Total: 1.5 to 2 days.

## 14. Open Questions

O-01. Should a local-dev `--source-only` scan mode be added now?

Recommendation: no. Keep AFE-6C focused on closure gate correctness. If developers later need source-only speed, add it as an explicit non-closure mode.

O-02. Should generated `dist/**` or `dist-integration/**` be committed as evidence?

Recommendation: no. Keep them rebuildable outputs and record command output plus counts in the implementation report.

O-03. Should AFE-6C introduce Playwright or axe-core to improve visual/accessibility confidence?

Recommendation: no. That would require dependency and lockfile authorization and changes the batch shape. Keep this batch zero-dependency.

## 15. P-Level Self-Check

P0: 0

P1: 0

P2: 0

P3: 0

Current status remains DOCUMENT PLAN ONLY / CODING GATED. This plan is not an authorization to code.
