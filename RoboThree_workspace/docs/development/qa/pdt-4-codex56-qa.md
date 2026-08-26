# PDT-4 Codex 5.6 Independent QA Report

| Attribute | Value |
| --- | --- |
| RUN_ID | `2026-08-09-0005-pdt-4-codex56` |
| Scope | PDT-4 Packaging / Hardening / Closeout and final Document Tool regression |
| Mode | Independent acceptance; read-only production code |
| Date | 2026-08-09 |
| Reviewer | Codex 5.6 |
| Environment | macOS arm64; Node `v24.13.0`; pnpm `11.11.0`; Vitest `4.1.10` |
| Git | N/A: RoboThree workspace is not initialized as the product Git repository |
| Evidence | `qa-reports/2026-08-09-0005-pdt-4-codex56/` |

## 1. Conclusion

**PASS — P0=0 / P1=0 / P2=0 / P3=1 (governance-only, non-blocking).**

The production implementation and final Document Tool regression pass. PDT-4 may enter user acceptance and the PDT-0 through PDT-4 series may close after explicit user acceptance.

The single P3 observation is that `DEVELOPMENT-LOG.md` references `docs/development/qa/pdt-4-claude-qa.md`, but that historical report file is absent. This run does not fabricate it. The present report and evidence restore a reproducible independent acceptance chain.

## 2. Independent execution

| Gate | Result |
| --- | --- |
| Offline frozen install | PASS; lockfile unchanged and workspace already up to date |
| Document Worker build | PASS |
| Core build | PASS |
| Desktop build, preload and renderer | PASS |
| Focused Document Tool / Artifact suite | PASS after environment-normalized rerun: 20 files / 135 tests total; 17 files / 125 tests passed in sandbox, 3 loopback files / 10 tests passed outside sandbox |
| Document Worker full suite | PASS: 23 files / 181 tests |
| Core + Desktop full suites | PASS: 100 files / 695 tests |
| `audit:dtp4` | PASS |
| Full workspace `check` | PASS: architecture boundary + 151 files / 1035 tests + Core/Desktop/Preload smoke |
| Static forbidden-scope scan | PASS |
| Targeted test-integrity scan | PASS; no skip/todo or constant true/false assertions in PDT-critical tests |

The first focused run produced ten failures whose common error was `listen EPERM: operation not permitted 127.0.0.1`. The same three files were rerun outside the restricted sandbox and passed 10/10. This is a QA execution-environment restriction, not a product failure.

## 3. Functional and security verification

1. `tool.document.pdf.extract_tables` is registered as a read-only Model-visible Tool and is bound to the trusted child-process Document Worker.
2. Its Model-visible input contains only `relativePath` and strict options; `workspaceRoot`, limits, absolute paths, parser handles and runtime authority are not exposed.
3. PDF table parsing stays in Document Worker and uses the existing pinned `pdfjs-dist` dependency; Core, Desktop, Contracts and Central do not import parser implementation.
4. No OCR, scanned-PDF, image-processing, XLSX table export, correction UI or bulk extraction scope was introduced.
5. No `DW_DIAGNOSTIC`, `_dw_*`, `tool.artifact` or `artifact.preview` Tool registration was found.
6. Table Observation and Artifact metadata remain bounded and do not expose workspace paths or raw table JSON.
7. Existing PDF text, XLSX read/write, DOCX read, overwrite confirmation, Artifact preview and HTML sandbox regressions passed.
8. Package locks remain: Root `0.0.0-dtp.4`; Contracts `0.0.0-mar.1.0`; Core/Desktop `0.0.0-pdt.3`; Document Worker `0.0.0-pdt.2`.
9. No production source file under `services/`, `apps/`, `packages/` or `scripts/` is newer than the accepted PDT-3 QA report after excluding generated outputs.

## 4. Issue

### P3-GOV-001 — referenced Claude PDT-4 report is absent

- Severity: P3
- Evidence: `DEVELOPMENT-LOG.md` links `docs/development/qa/pdt-4-claude-qa.md`; the file does not exist.
- Impact: no runtime or security impact, but the earlier QA summary cannot be independently reconstructed from its claimed report path.
- Treatment: preserve the historical statement, add this independent report and evidence, and do not fabricate the missing Claude report.
- Release impact: non-blocking.

## 5. Scope retained as GATED

- OCR and scanned/image PDF recognition;
- XLSX export of extracted tables;
- manual correction UI;
- bulk extraction;
- formal installer and OS-level sandbox hardening.

## 6. Terminology note

The registry contains **five unique Document Tool IDs**:

1. `tool.document.pdf.extract_text`
2. `tool.document.pdf.extract_tables`
3. `tool.document.xlsx.read`
4. `tool.document.docx.read`
5. `tool.document.xlsx.write`

`xlsx.write` supports both create-new and confirmed overwrite modes; DWE and DWO are two development series for the same Tool ID. Artifact Preview and Manual Artifact Registration are Application capabilities, not additional Tool IDs.

## 7. Recommendation

Accept PDT-4 as PASS, close PDT-4 and then close the PDT series. Continue to describe the shipped surface as five registered Document Tool IDs with two XLSX write modes plus Artifact Preview, rather than six distinct Tool IDs.

