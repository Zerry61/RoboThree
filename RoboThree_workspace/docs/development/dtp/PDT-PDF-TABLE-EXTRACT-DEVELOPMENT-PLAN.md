# PDT PDF Table Extract Development Plan

> Owner: Codex 5.6
> Status: PDT-0 PASS/CLOSED; PDT-1 PASS/CLOSED; PDT-2 PASS/CLOSED; PDT-3 PASS/CLOSED; PDT-4 IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING
> Date: 2026-08-08

## 1. Current Gate

```text
DTP-0 -> DTP-4: PASS/CLOSED
DWE-0 -> DWE-3: PASS/CLOSED
DWO-0 -> DWO-3: PASS/CLOSED
APV-0 -> APV-3C: PASS/CLOSED
MAR-0 -> MAR-1B: PASS/CLOSED

PDT-0: PASS/CLOSED
PDT-1: PASS/CLOSED
PDT-2: PASS/CLOSED
PDT-3: PASS/CLOSED
PDT-4: IMPLEMENTED / SELF-TEST PASS / INDEPENDENT QA PENDING

OCR / scanned PDF table recognition: GATED
PDF table export to XLSX: GATED
manual table correction UI: GATED
bulk document table extraction: GATED
OS Sandbox: GATED
formal installer: GATED
```

PDT adds a new read-only Document Tool capability:

```text
tool.document.pdf.extract_tables
```

It does not reopen `tool.document.pdf.extract_text`. It reuses the existing
Document Worker source/path guard, parser execution boundary, pdfjs dependency,
child-process runtime boundary, WorkspaceGrant authority, and Core tool
execution pipeline.

PDT-0 is closed as a documentation freeze. PDT-1 implements only the Document
Worker private foundation. It does not add dependencies, does not edit lockfile
or root TypeScript configuration, and does not register the new Tool in Core.

## 2. Product Scope

P0 supports table extraction from digitally-born, text-selectable PDFs.

Allowed:

- extract table candidates from existing text layer geometry;
- preserve source page order, table order, row order, and column order;
- return bounded structured rows and cells;
- include page/table/cell locators suitable for citation and debugging;
- include approximate geometry when requested;
- include confidence and warnings when table structure is heuristic;
- fail closed or return low-confidence warnings for ambiguous layouts;
- use existing `pdfjs-dist@6.2.108` only.

Forbidden:

- OCR;
- scanned image table recognition;
- image-only PDF understanding;
- ML/vision model table detection;
- chart, form, signature, annotation, or vector drawing interpretation;
- automatic cross-page table merge;
- spreadsheet export or XLSX generation;
- user-editable table correction UI;
- bulk document/folder extraction;
- network fetches, runtime downloads, shell, nested worker, or dynamic parser
  loading;
- claiming OS-level sandbox guarantees.

P0 must be honest about PDF limits. If the PDF has no usable text layer, the
Tool must return a typed `unsupported_feature` failure instead of pretending to
understand scanned tables.

## 3. Capability And Naming

Formal Tool ID:

```text
tool.document.pdf.extract_tables
```

Display name:

```text
PDF Extract Tables
```

Capability class:

```text
read-only Document Tool
```

Risk:

```text
ResourceAccess.operation: read
risk fact: routine_file
readOnlyHint: true
maxConcurrency: inherited from Document Worker descriptor, currently 1
```

The capability must not be registered in PDT-0 or PDT-1. PDT-2 is the first
batch allowed to add Core Tool Registry exposure.

## 4. Model-Visible Input Schema Draft

PDT-2 should expose only model-safe input fields:

```json
{
  "relativePath": {
    "type": "string",
    "description": "Path to a PDF file under the selected workspace."
  },
  "options": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "pageStart": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "First 1-based page to inspect."
      },
      "pageEnd": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "Last 1-based page to inspect."
      },
      "maxTables": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "Maximum number of tables returned."
      },
      "maxRows": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "Maximum number of rows returned."
      },
      "maxCells": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "Maximum number of cells returned."
      },
      "maxTextBytes": {
        "type": ["integer", "null"],
        "minimum": 1,
        "description": "Maximum UTF-8 text bytes returned across all cells."
      },
      "includeGeometry": {
        "type": ["boolean", "null"],
        "description": "Whether to include approximate PDF point bounding boxes. Geometry is only for human source-location reference and should not be treated as semantic table truth."
      },
      "minConfidence": {
        "type": ["number", "null"],
        "minimum": 0,
        "maximum": 1,
        "description": "Minimum table confidence to return."
      }
    }
  }
}
```

Forbidden model-visible fields:

- `workspaceRoot`;
- `rootRealPath`;
- absolute path;
- file descriptor, FileHandle, fd, temp path, worker path, parser path;
- parser execution id;
- request digest;
- trust/confidence override;
- OCR enable flag;
- network URL.

`options` may be omitted or null. Core and Document Worker strict parsers must
normalize null to defaults, matching the DTP-2.0 repair rule for cross-service
option parsing.

## 5. Worker-Private Input Schema Draft

PDT-1 may define a Document Worker private request shape:

```ts
type PdfExtractTablesPrivateRequest = Readonly<{
  capabilityId: "tool.document.pdf.extract_tables";
  relativePath: string;
  workspaceRoot: string;
  deadlineAt: string;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  options: PdfExtractTablesOptions;
  limits: DocumentWorkerLimits & Readonly<{
    maxPdfTablePages: number;
    maxPdfTextItems: number;
    maxPdfTables: number;
    maxPdfTableRows: number;
    maxPdfTableCells: number;
    maxPdfTableOutputBytes: number;
  }>;
}>;
```

Ownership remains unchanged:

```text
Core
-> inject workspaceRoot from active WorkspaceGrant
-> child_process Document Worker
-> SecuredDocumentSource opens and reads bounded bytes
-> ParserExecutionBoundary transfers standalone bytes
-> parser worker calls pdfjs and table detector
-> result/error returns to Runtime
-> Runtime owns terminal state
```

Parser worker must never receive real filesystem authority beyond transferred
bytes and strict options.

## 6. Output Schema Draft

PDT output should be structured but bounded.

```ts
type PdfExtractTablesOutput = Readonly<{
  format: "pdf";
  extraction: "tables";
  pageCount: number;
  selectedPageCount: number;
  tables: readonly PdfTable[];
  warnings: readonly PdfTableWarning[];
}>;

type PdfTable = Readonly<{
  pageNumber: number;
  tableIndex: number;
  rowCount: number;
  columnCount: number;
  confidence: number;
  locator: PdfTableLocator;
  bbox?: PdfPageBox;
  rows: readonly PdfTableRow[];
  warnings: readonly PdfTableWarning[];
}>;

type PdfTableRow = Readonly<{
  rowIndex: number;
  bbox?: PdfPageBox;
  cells: readonly PdfTableCell[];
}>;

type PdfTableCell = Readonly<{
  rowIndex: number;
  columnIndex: number;
  text: string;
  bbox?: PdfPageBox;
  confidence: number;
  warnings: readonly PdfTableWarning[];
}>;

type PdfTableLocator = Readonly<{
  pageNumber: number;
  tableIndex: number;
}>;

type PdfPageBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "pdf_point";
  origin: "top_left";
}>;

type PdfTableWarning =
  | "low_confidence"
  | "ambiguous_columns"
  | "ambiguous_rows"
  | "merged_cells_not_supported"
  | "rotated_text_ignored"
  | "table_truncated"
  | "page_truncated";
```

Rules:

- `pageNumber`, `tableIndex`, `rowIndex`, and `columnIndex` are 1-based.
- Row order follows visual top-to-bottom order after normalizing page rotation.
- Column order follows visual left-to-right order.
- Geometry is approximate and must be marked as page-space `pdf_point`.
- `origin="top_left"` is required so consumers do not infer pdfjs bottom-left
  coordinates.
- `unit="pdf_point"` means 1 point = 1/72 inch. Geometry is source-location
  metadata for human review and debugging, not a semantic guarantee.
- Empty inferred cells may be emitted only when the row/column grid is stable.
- P0 does not infer `rowSpan` or `colSpan`. Merged-cell detection may only
  produce warnings.
- Cell text must be normalized with the same Unicode policy as the existing PDF
  text extractor unless PDT-1 documents a stricter policy.

## 7. Algorithm Baseline

PDT-1 should start from the existing pdfjs text layer and avoid new parser
dependencies.

Baseline flow:

```text
load PDF with existing pdfjs settings
-> select bounded pages
-> getTextContent per page
-> convert text items into normalized glyph/text boxes
-> group items into visual lines by y-overlap and baseline proximity
-> infer row clusters from stable line bands
-> infer column bands from x intervals and repeated alignment
-> detect candidate rectangular regions with >= 2 rows and >= 2 columns
-> score confidence
-> emit bounded tables above minConfidence
```

Confidence should consider:

- number of rows and columns;
- repeated x alignment across rows;
- y spacing consistency;
- cell text density;
- presence of obvious delimiters or aligned numeric/text columns;
- ambiguity caused by paragraph-like text;
- rotated/skewed text;
- empty or overlapping cells.

P0 must prefer false negatives over false positives. If a paragraph layout looks
like a table only because words happen to align, the detector should either
drop the candidate below `minConfidence` or return a warning with low
confidence.

## 8. Typed Errors And Warnings

Worker terminal error codes must align with existing Document Worker protocol.

Allowed top-level codes:

- `invalid_format`;
- `unsupported_feature`;
- `limit_exceeded`;
- `cancelled`;
- `timed_out`;
- `internal_failure`.

Recommended detail codes:

```text
pdf_table_no_text_layer
pdf_table_page_range
pdf_table_page_count
pdf_table_text_items
pdf_table_count
pdf_table_rows
pdf_table_cells
pdf_table_output
pdf_table_geometry
pdf_encrypted
pdf_corrupt
```

Rules:

- no text layer must fail closed with `unsupported_feature` and detail
  `pdf_table_no_text_layer`;
- encrypted PDFs must keep existing fail-closed behavior;
- output budget overflow must be `limit_exceeded`, not partial unmarked output;
- deadline must be `timed_out`, not `deadline_exceeded`;
- Core recovery, if any, owns `uncertain`; Worker must not invent an
  `uncertain` terminal code.
- parser failures that cannot be mapped to a specific PDF format or capability
  boundary must use `internal_failure`, not ad hoc top-level codes.

## 9. Security And Resource Boundary

PDT must reuse the DTP security boundary:

- WorkspaceGrant is resolved in Core.
- `relativePath` is the only model-visible file reference.
- Document Worker resolves safe path and performs realpath containment.
- File size is checked before large allocation.
- bytes are transferred to parser worker as standalone buffers.
- parser worker has `resourceLimits` and `execArgv: []`.
- parser worker guard continues to block network, shell, nested workers, dynamic
  unsafe modules, stdout/stderr protocol writes, and runtime downloads.
- Runtime remains the only state machine for busy, cancel, deadline, terminal,
  and late message handling.

Additional PDT resource limits:

- maximum selected pages;
- maximum pdfjs text items per page and total;
- maximum candidate tables;
- maximum rows;
- maximum cells;
- maximum cell text bytes;
- maximum serialized output bytes;
- maximum warnings.

## 10. Batch Breakdown

### PDT-0 Contract / Security / Algorithm Freeze

Docs-only.

Allowed changes:

```text
docs/development/dtp/PDT-PDF-TABLE-EXTRACT-DEVELOPMENT-PLAN.md
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

Forbidden:

- production code;
- tests;
- dependencies;
- lockfile;
- root package version;
- package versions;
- Tool Registry;
- public Contracts.

Exit:

- plan captures product scope, schema drafts, algorithm baseline, typed errors,
  QA matrix, and work estimates;
- Claude Code performs read-only review;
- user accepts PDT-0 before PDT-1 coding.

### PDT-1 Document Worker Private Foundation

Implemented parser foundation but does not expose a model-visible Tool.

Allowed changes:

```text
services/document-worker/src/**
services/document-worker/tests/**
services/document-worker/package.json
docs/development/dtp/PDT-PDF-TABLE-EXTRACT-DEVELOPMENT-PLAN.md
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

Implementation:

- add strict `tool.document.pdf.extract_tables` option parser;
- add private capability router branch;
- require `tool.document.pdf.extract_tables` to run through Document Worker
  private protocol only; public protocol calls must fail closed;
- add pdf table extraction implementation using existing pdfjs;
- add output budget enforcement;
- add low-confidence/unsupported behavior tests;
- keep Core registry unaware of this capability.

PDT-1 must not add dependencies unless PDT-0 review explicitly reopens the
dependency decision and the user grants a lockfile window.

PDT-1 implementation result:

- added Worker-private `tool.document.pdf.extract_tables` option parsing without
  adding it to public `DOCUMENT_CAPABILITIES`;
- added a private capability set so Core Registry imports still expose only the
  previously registered Document Tools;
- added Document Worker router enforcement that PDF table extraction requires
  `v1alpha2` private protocol and fails closed on public protocol;
- added `src/pdf/pdf-extract-tables.ts` using existing `pdfjs-dist@6.2.108`
  `getTextContent` text-layer geometry only;
- implemented conservative row/column clustering, 1-based page/table/row/cell
  locators, optional PDF-point `bbox`, confidence, warnings, and output budgets;
- locked no-text-layer PDFs to `unsupported_feature` +
  `pdf_table_no_text_layer`;
- propagated parser worker `detailCode` through ParserExecutionBoundary so
  private typed errors survive worker-thread execution;
- added three checked-in digitally-born PDF fixture patterns as baseline
  evidence: simple grid, whitespace-aligned table, and multi-page/multi-table
  extraction;
- kept Core, Contracts, Desktop, Central, Tool Registry, lockfile, dependencies,
  root package, and root tsconfig unchanged.

### PDT-2 Core Registry / Agent Exposure

Registers the Tool and exposes it to Agent catalog.

Allowed changes:

```text
services/core/src/**
services/core/tests/**
services/document-worker/src/handlers/document-capability-options.ts
services/document-worker/package.json
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
docs/development/dtp/PDT-PDF-TABLE-EXTRACT-DEVELOPMENT-PLAN.md
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

Implementation:

- add `tool.document.pdf.extract_tables` to Document Tool registry;
- define model-visible input/output schema;
- bump descriptor/revision intentionally;
- update Document Worker backend capability allowlist;
- update scripted model table-extraction intent only if needed for focused
  Core tests;
- project bounded model context previews.

PDT-2 must not modify Desktop UI beyond test fixtures.

PDT-2 implementation result:

- promoted `tool.document.pdf.extract_tables` from Worker-private-only exposure
  into the canonical Document Worker capability list so Core can register it
  formally; the PDT-1 parser implementation and protocol guard remain
  unchanged;
- added the Core registry definition, binding, descriptor/risk revision bump,
  and model-visible schema for `relativePath + options` only;
- kept `workspaceRoot`, limits, parser identifiers, file handles, digests, and
  filesystem authority out of the model-visible schema;
- added bounded Tool Observation preview for table output: header plus up to
  five tables, three rows per table, six cells per row, and warnings, without
  serializing raw `tables` JSON or full cell payloads;
- updated the Desktop scripted model provider only for explicit table intent
  (`table`/`tables`/`表格`), while ordinary PDF read requests still call
  `tool.document.pdf.extract_text`;
- verified Core backend can execute the real Document Worker child for
  `tool.document.pdf.extract_tables` through the existing v1alpha2 private
  protocol;
- synchronized Core and Document Worker package versions to `0.0.0-pdt.2` and
  updated the packaging audit version locks, closing the PDT-1 package-version
  P3;
- did not modify Contracts, Desktop production UI, Central, lockfile, root
  package, root tsconfig, OCR/scanned PDF support, XLSX export, correction UI,
  or bulk extraction.

### PDT-3 Desktop Product E2E

Validates the full interactive path.

Allowed changes:

```text
apps/desktop/src/**
apps/desktop/tests/**
services/core/src/adapters/fake/**
services/core/tests/**
docs/development/dtp/PDT-PDF-TABLE-EXTRACT-DEVELOPMENT-PLAN.md
docs/development/DEVELOPMENT-LOG.md
CHANGELOG.md
README.md
```

Implementation:

- scripted model recognizes explicit table extraction requests;
- E2E: user turn -> tool call -> Document Worker -> table result ->
  assistant final response;
- Artifact Panel receives metadata from existing APV projection if the tool
  result qualifies;
- no table editor, no spreadsheet export, no OCR UI.

PDT-3 implementation result:

- added a Desktop product E2E for explicit PDF table extraction:
  `submitTurn("Extract tables from tables.pdf")` -> scripted model tool-call ->
  Core Tool bridge -> Document Worker -> `tool.document.pdf.extract_tables`
  result -> final assistant message;
- verified the assistant-visible Tool Observation contains the bounded table
  summary (`[table 1]`, row/cell text) and omits raw `"tables"` JSON and
  workspace real paths;
- corrected Artifact projection for `tool.document.pdf.extract_tables` so it is
  treated as a PDF/document artifact (`mediaType=application/pdf`) instead of
  falling through to the XLSX fallback;
- added APV projection coverage for PDF table artifacts: task detail metadata
  contains bounded counts only, while artifact text preview can render sanitized
  markdown/plain table content on demand;
- verified Task Detail / Artifact metadata does not leak `workspaceRoot`,
  absolute path, raw table JSON, or full cell payload;
- synchronized Core/Desktop versions to `0.0.0-pdt.3` and updated packaging
  audit version locks; Document Worker remains `0.0.0-pdt.2`;
- did not add Desktop OCR UI, table editor, XLSX export, bulk extraction,
  Contracts, Central, lockfile, root package, or root tsconfig changes.

### PDT-4 Packaging / Hardening / Closeout

No new feature surface by default.

Focus:

- packaging/audit updates if registry version drift requires it;
- static scans for forbidden dependency and runtime patterns;
- full workspace check;
- final QA matrix;
- independent QA handoff.

PDT-4 closeout result:

- accepted PDT-3 independent QA as `PASS/CLOSED`;
- kept package versions unchanged because PDT-3 already synchronized the
  current packaging/audit locks (`Core/Desktop=0.0.0-pdt.3`,
  `Document Worker=0.0.0-pdt.2`) and no registry version drift remains;
- did not modify production source code, Tool schema, Contracts, Central,
  lockfile, root package, root tsconfig, OCR/scanned PDF support, XLSX export,
  manual correction UI, or bulk extraction;
- refreshed PDT-4 closeout gates: DW/Core/Desktop builds, key E2E, DW/Core/
  Desktop full tests, lint, architecture boundary, packaging audit, offline
  frozen install, full `pnpm run check`, static scans, version locks and
  immutable root/package/lockfile/tsconfig evidence.

## 11. QA Matrix

PDT-0 review must verify:

- docs-only changes;
- no production code;
- no dependencies or lockfile changes;
- `tool.document.pdf.extract_tables` remains unregistered;
- P0 excludes OCR/scanned PDF recognition;
- schema drafts do not expose path authority;
- typed errors align with existing protocol;
- PDT-1/PDT-2/PDT-3 remain gated.

PDT-1 QA must additionally verify:

- digitally-born PDF with simple grid table;
- digitally-born PDF with whitespace-aligned table;
- multiple tables on one page;
- multi-page extraction without cross-page merge;
- Unicode cell text;
- empty cells;
- rotated text warning or exclusion;
- paragraph-like false-positive rejection;
- no text layer behavior;
- at least three small, checked-in, digitally-born PDF fixtures with known table
  structures as development baseline evidence; PDT-1 should report cell-level
  recall/precision notes for these fixtures, while exact thresholds remain
  engineering evidence rather than a model-visible product guarantee;
- encrypted PDF;
- corrupt PDF;
- page range validation;
- page/text item/table/row/cell/output budget failures;
- cancel-first, deadline-first, completion-first;
- crash, malformed parser message, late message;
- 1000 parser executions with bounded timers/listeners/resources;
- existing PDF extract_text, XLSX read/write, DOCX read regression.

PDT-2 QA must additionally verify:

- registry definition and descriptor revision;
- model-visible schema includes only relativePath/options;
- Core does not import pdfjs or parser code;
- workspaceRoot is injected only from active WorkspaceGrant;
- Tool context preview is bounded and omits full raw table JSON when too large;
- existing Document Tools remain unchanged.

PDT-3 QA must additionally verify:

- real interactive tool-call loop for table extraction;
- assistant final answer references extracted table summary;
- Artifact projection does not leak workspaceRoot or raw oversized output;
- APV remains an Application capability, not `artifact.preview` Tool;
- no OCR/scanned-PDF UI promise.

PDT-4 QA must verify:

```text
DW build
DW focused tests
DW full tests
Core focused tests
Core full tests
Desktop E2E tests
Contracts regression if touched
lint + architecture boundary
audit scripts
offline frozen install
pnpm run check
static scans
```

## 12. Static Scan Requirements

Each coding batch must run targeted scans for:

```text
artifact.preview
tool.artifact
tool.document.pdf.extract_tables
pdfjs-dist
tesseract
ocr
canvas
sharp
opencv
child_process
worker_threads
fetch
http
https
net
tls
dns
dgram
DW_DIAGNOSTIC
```

Expected rules:

- `tool.document.pdf.extract_tables` appears only where authorized by the
  current batch;
- `pdfjs-dist` stays inside Document Worker PDF implementation paths;
- no OCR, vision, or image-processing dependency appears in production code;
- no new canvas entity is installed or required;
- no Document Worker diagnostic backdoor appears.

## 13. Known Residual Risks

- PDF tables are layout heuristics, not a semantic document structure in the PDF
  standard.
- Whitespace-aligned tables and multi-column prose can be ambiguous.
- Merged cells, rotated text, nested tables, and cross-page continuation are not
  reliable in P0.
- Scanned PDFs require OCR, which is explicitly out of scope.
- Existing `pdfjs-dist` package size and resource footprint remain inherited
  from DTP-1A; PDT does not solve package trimming.
- Worker-thread isolation remains application-level hardening, not an OS
  sandbox.

## 14. Engineering Estimate

```text
PDT-0: 0.5 to 1 concentrated engineering day
PDT-1: 4 to 7 concentrated engineering days
PDT-2: 2 to 3 concentrated engineering days
PDT-3: 1 to 2 concentrated engineering days
PDT-4: 0.5 to 1 concentrated engineering day

Total: 8 to 14 concentrated engineering days
```

The estimate excludes independent QA, user acceptance, fixture review, and
rework.

## 15. Review Questions

Claude Code should review PDT-0 before any coding and answer:

1. Is P0 scope correctly limited to digitally-born, text-selectable PDFs?
2. Is the output schema usable without overstating table accuracy?
3. Is the no-text-layer behavior correctly locked to `unsupported_feature` +
   `pdf_table_no_text_layer` fail-closed?
4. Are `rowSpan`/`colSpan` correctly excluded from P0?
5. Are dependency and lockfile boundaries strict enough?
6. Are PDT-1/PDT-2/PDT-3 split cleanly enough to avoid premature Tool
   registration?
7. Are typed errors aligned with existing Document Worker protocol?
8. Is the QA matrix sufficient to catch false positives and resource leaks?

Required answer for question 3:

```text
No text layer should fail closed with unsupported_feature + pdf_table_no_text_layer.
```

This keeps P0 honest and avoids teaching users that scanned table extraction is
supported.
