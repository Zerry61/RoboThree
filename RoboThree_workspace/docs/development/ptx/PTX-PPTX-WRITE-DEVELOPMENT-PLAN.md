# PTX PPTX Write Development Plan

> Owner: Codex 5.6
> Status: PTX-0 PASS/CLOSED; PTX-1 PASS/CLOSED via 0.0.0-ptx.1; PTX-2 PASS/CLOSED via 0.0.0-ptx.2; PTX-3 PASS/CLOSED via 0.0.0-ptx.3; PTX-4 PASS/CLOSED via 0.0.0-ptx.4
> Date: 2026-08-25

## 1. Current Gate

```text
Document Tool Pack:
  DTP / DWE / DWO / PDT / APV / MAR: PASS/CLOSED

PTX Overall:
  PTX-0 PASS/CLOSED; PTX-1 PASS/CLOSED; PTX-2 PASS/CLOSED; PTX-3 PASS/CLOSED; PTX-4 PASS/CLOSED

PTX-0:
  PASS/CLOSED

PTX-1 Private ResourceResolver + PPTX Writer:
  PASS/CLOSED via 0.0.0-ptx.1

PTX-2 Tool Activation:
  PASS/CLOSED via 0.0.0-ptx.2

PTX-3 Desktop E2E:
  PASS/CLOSED via 0.0.0-ptx.3

PTX-4 PPTX Visual Preview Spike:
  PASS/CLOSED via 0.0.0-ptx.4
```

PTX adds a new PPTX creation capability to the existing Document Tool family. It
does not reopen DTP/DWE/DWO/PDT/APV/MAR decisions, does not replace XLSX write
publication semantics, and does not create a separate PPT-specific file system
authority model.

This PTX-0 batch is documentation-only. It does not install `pptxgenjs`, does not
modify `pnpm-lock.yaml`, does not change package versions, does not register a
Tool, and does not modify production code.

The target formal Tool ID is:

```text
tool.document.pptx.write
```

## 2. Product Goal

Create a safe first-party Tool that writes a new `.pptx` artifact from a stable
RoboThree-owned presentation specification.

The intended product flow is:

```text
LLM
  -> PresentationSpecV1
  -> Core ResourceResolver
  -> ResolvedPresentationSpecV1
  -> PptxWriterAdapter
  -> PPTX bytes
  -> WorkspaceGrant + Artifact Publication
  -> .pptx Artifact
```

PptxGenJS is only an adapter implementation detail. It must not enter the model
visible Tool contract, Core domain language, recovery material, or Artifact
identity semantics.

## 3. Non-Goals

PTX P0 does not implement:

- PowerPoint editing of an existing `.pptx`;
- arbitrary OOXML/XML injection;
- animation, transitions, video, SmartArt, OLE, macros, or embedded objects;
- Office COM automation;
- PowerPoint MCP integration;
- online collaborative editing;
- arbitrary `.pptx` / `.potx` template import;
- visual slide thumbnail rendering;
- OCR or image understanding;
- a general purpose URL fetch Tool;
- model-visible PptxGenJS APIs such as `addText`, `addShape`, `addImage`, or
  `addChart`.

## 4. Dependency Position

The preferred PPTX generation substrate is `gitbrent/PptxGenJS`.

Rationale:

- TypeScript / JavaScript implementation suitable for RoboThree Node/Electron
  runtime;
- no local Microsoft PowerPoint installation requirement for generation;
- supports text, images, tables, charts, shapes, slide masters, themes, and
  common office-compatible PPTX output;
- MIT license;
- easier to isolate inside the existing Document Worker than adding a Python
  worker stack for `python-pptx`.

PTX-0 freezes only the selection direction. PTX-1 must run an exclusive
dependency window before production use:

- choose the exact `pptxgenjs` version, currently preferred candidate
  `pptxgenjs@4.0.1` subject to registry verification;
- inspect npm metadata, license, tarball integrity, scripts, transitive
  dependencies, package size, and offline install behavior;
- update `pnpm-lock.yaml` only in the authorized PTX-1 dependency window;
- verify no runtime download, no postinstall execution requirement, and no
  dependency on Microsoft Office or platform GUI automation.

`python-pptx` remains a fallback option only. PTX must not maintain two PPTX
writer implementations in parallel.

## 5. PresentationSpecV1

The model-visible input is a RoboThree-owned versioned specification, not a
PptxGenJS command stream.

```text
PresentationSpecV1
  schemaVersion: "1"
  output
    relativePath
    name?
  layout: "wide" | "standard"
  templateRef?
  metadata?
  slides[]
    title?
    layout?
    elements[]
```

V1 element whitelist:

```text
text
image
table
chart
shape
```

V1 forbids:

```text
animation
transition
video
external hyperlink
embedded object / OLE
macro
YouTube / remote media embed
arbitrary XML
arbitrary PPTX/POTX template import
```

Future behavior changes require a new specification version. V1 behavior must
not be silently widened to support SmartArt, animation, arbitrary template
import, or writer-specific escape hatches.

## 6. Model-Visible Schema Draft

PTX-2 will expose a schema in this shape. PTX-1 must not register it.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["relativePath", "presentation"],
  "properties": {
    "relativePath": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1024,
      "description": "Workspace-relative .pptx target path. Absolute paths are rejected."
    },
    "mode": {
      "enum": ["create_new", "overwrite_existing"],
      "default": "create_new"
    },
    "presentation": {
      "$ref": "#/$defs/presentation"
    },
    "options": {
      "$ref": "#/$defs/options"
    }
  },
  "$defs": {
    "presentation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["schemaVersion", "layout", "slides"],
      "properties": {
        "schemaVersion": { "const": "1" },
        "layout": { "enum": ["wide", "standard"] },
        "templateRef": { "type": "string", "minLength": 1, "maxLength": 128 },
        "metadata": { "type": "object", "additionalProperties": false },
        "slides": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/slide" }
        }
      }
    },
    "slide": {
      "type": "object",
      "additionalProperties": false,
      "required": ["elements"],
      "properties": {
        "title": { "type": "string", "maxLength": 512 },
        "layout": { "type": "string", "maxLength": 128 },
        "elements": {
          "type": "array",
          "items": { "$ref": "#/$defs/element" }
        }
      }
    },
    "element": {
      "oneOf": [
        { "$ref": "#/$defs/textElement" },
        { "$ref": "#/$defs/imageElement" },
        { "$ref": "#/$defs/tableElement" },
        { "$ref": "#/$defs/chartElement" },
        { "$ref": "#/$defs/shapeElement" }
      ]
    }
  }
}
```

The exact JSON Schema belongs to PTX-2. PTX-0 freezes only the contract shape and
forbidden categories.

## 7. Resource Sources

Images may be referenced in the model-visible spec, but the PPTX writer must not
fetch them directly.

Allowed image source forms:

```text
artifactRef
workspaceResourceRef
authorizedImageRef
url
```

Execution must resolve every image source into:

```text
ResolvedImageResource
  bytes
  mimeType
  digest
  safeSourceSummary
```

The `PptxWriterAdapter` receives only resolved bytes and safe metadata. It must
not receive URL strings, real file paths, Cookie headers, bearer tokens,
Credential references, WorkspaceGrant authority, or filesystem handles.

## 8. URL ResourceResolver Security Freeze

Remote URL input is allowed for product usability, but URL fetching is a Core
ResourceResolver concern, not a PPT writer capability.

Baseline URL rules:

- only `https://` is allowed;
- no userinfo, fragment, or unsafe URL encoding;
- no browser cookies, system credentials, enterprise credentials, or custom
  user-supplied headers;
- P0 media types are limited to `image/png`, `image/jpeg`, and `image/webp`;
- per-image size, total image size, redirect count, and timeout are bounded;
- audit material records only safe summary: host, normalized path class if safe,
  MIME type, byte size, digest, and redirect count;
- raw query strings are not copied into logs, errors, QA evidence, or Artifact
  metadata.

### 8.1 Resolve / Validate / Connect Pinning

The resolver must prevent DNS rebinding by using this sequence:

```text
resolve hostname
  -> validate every candidate IP
  -> connect using the same validated resolved IP
  -> keep TLS SNI and Host header as the original hostname
  -> verify remoteAddress after connect
```

The HTTP client must not perform an unreviewed second DNS lookup after the IP
validation step.

Rejected address ranges:

```text
IPv4:
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  127.0.0.0/8
  169.254.0.0/16
  0.0.0.0/8
  169.254.169.254

IPv6:
  ::1
  fc00::/7
  fe80::/10
```

PTX-1 must test DNS rebinding-style behavior: a URL that validates to a public
IP and then attempts to connect to a private IP must fail closed.

### 8.2 Redirect Control

Automatic redirect following must be disabled. Every 30x response is handled by
the ResourceResolver itself.

For each redirect target, the resolver repeats the full policy:

```text
scheme validation
host normalization
DNS resolve
IP deny-list validation
connect using the same resolved IP
remoteAddress verification
Content-Type / magic validation
size / timeout enforcement
```

Maximum redirects must be fixed in PTX-0 limits, with `3` as the preferred
starting value. Exceeding the redirect limit fails closed.

### 8.3 Magic Bytes

`Content-Type` is not sufficient. Downloaded bytes must match the declared media
type.

Required magic checks:

```text
PNG:
  89 50 4E 47 0D 0A 1A 0A

JPEG:
  FF D8 FF

WEBP:
  RIFF....WEBP
```

If declared type and observed magic do not match, the resolver fails closed.
Unknown, ambiguous, empty, truncated, or HTML-like responses fail closed.

## 9. TemplateRef Semantics

`templateRef` is a RoboThree registered Presentation Theme/Master ID.

Examples:

```text
robothree.default
enterprise.basic
```

It is not a filesystem path, URL, arbitrary artifact reference, or uploaded
`.pptx` / `.potx` template file.

P0 template behavior is implemented by trusted code-owned masters/themes. Future
enterprise template import requires a separate Template Import plan covering
template validation, media/resource extraction, macro/OLE rejection, licensing,
Preview, and versioning.

## 10. Resource Limits

PTX-0 freezes the categories. PTX-1 must fill exact values before code is
accepted.

Required limits:

```text
maxSlides
maxElementsPerSlide
maxTextBytes
maxImageBytes
maxTotalImageBytes
maxTableRows
maxTableColumns
maxChartSeries
maxOutputBytes
workerTimeoutMs
resourceResolveTimeoutMs
maxRedirects
```

Preferred initial values for review:

```text
maxSlides: 40
maxElementsPerSlide: 32
maxTextBytes: 256 KiB
maxImageBytes: 8 MiB
maxTotalImageBytes: 32 MiB
maxTableRows: 100
maxTableColumns: 12
maxChartSeries: 16
maxOutputBytes: 64 MiB
workerTimeoutMs: 30_000
resourceResolveTimeoutMs: 10_000
maxRedirects: 3
```

Exceeding any limit must fail before unbounded Writer work. Resource resolution
and PPTX generation must be separately bounded so a large or slow image download
cannot consume the Writer budget invisibly.

## 11. File Publication Semantics

PTX must reuse DWE/DWO write semantics.

PptxGenJS stops at:

```text
PresentationSpecV1 -> PPTX bytes
```

RoboThree owns:

```text
bytes
  -> staging
  -> atomic publication
  -> Artifact record
  -> event / observation / recovery material
```

Default behavior:

- `create_new`;
- WorkspaceGrant operation `create`;
- no-clobber publication;
- target exists returns typed `target_exists`;
- missing parent directory fails closed;
- no direct rename/copy into an unchecked final path;
- File/Artifact publication must be recoverable and idempotent.

Overwrite behavior:

- implemented only in PTX-2 or later;
- reuses XLSX write destructive confirmation discipline;
- confirmation binds exact Task, Tool, target, old digest, new request digest,
  workspaceGrantId, action identity, and idempotency key;
- no broad "allow PPT write" permission;
- no bulk overwrite.

## 12. Artifact Preview Boundary

PTX-3 may close with Generic Preview only:

```text
file name
kind: PowerPoint
media type
byte size
slide count
created time
open / reveal affordance
```

Visual preview was implemented as a separate gated spike in PTX-4:

```text
PTX-4:
  PPTX -> bounded OOXML text extraction -> sandboxed local HTML/SVG slide cards
```

PptxGenJS does not solve rendering. PTX-4 intentionally chose a dependency-free,
offline, Main-owned OOXML-to-HTML/SVG baseline preview instead of Microsoft
PowerPoint, LibreOffice, remote rendering, or pixel-perfect slide rasterization.
The preview is sufficient for safe visual inspection of slide count, slide titles,
bounded text, and basic table/chart/image markers. It must not claim pixel-perfect
PowerPoint fidelity.

## 13. Development Stages

### PTX-0 — Contract / Dependency / Resource Freeze

Allowed:

- this development plan;
- governance docs only;
- dependency and license research;
- QA matrix freeze.

Forbidden:

- production code;
- package version changes;
- `pnpm-lock.yaml`;
- `package.json` dependency changes;
- Tool Registry changes;
- Document Worker implementation;
- Core / Desktop / Contracts / Central changes;
- PptxGenJS installation.

### PTX-1 — Private ResourceResolver + PPTX Writer

Scope:

- exclusive dependency window for `pptxgenjs`;
- private ResourceResolver foundation for URL image resolution;
- Document Worker private writer;
- strict `PresentationSpecV1` parser;
- trusted template registry foundation;
- resource resolution into `ResolvedImageResource`;
- Writer input limited to resolved image bytes only;
- PptxWriterAdapter generates PPTX bytes only;
- no public Tool registration.

### PTX-2 — Tool Activation

Scope:

- public `tool.document.pptx.write` registration;
- WorkspaceGrant create / overwrite integration;
- Core Tool execution integration for the PTX-1 private ResourceResolver and Writer;
- Artifact Generic Preview projection;
- Core recovery and E2E tool execution.

### PTX-3 — Desktop Product E2E

Scope:

- scripted/model E2E from user prompt to PresentationSpecV1;
- Desktop task flow;
- Artifact visibility and open/reveal;
- real consumer validation for generated `.pptx`.

### PTX-4 — PPTX Visual Preview Spike

Scope:

- Main-owned bounded PPTX OOXML read for generated task-scoped artifacts;
- sandboxed `127.0.0.1` HTML Preview integration with existing APV-1C server;
- local/offline behavior with no new dependency and no Office/LibreOffice runtime;
- Task Detail routing to visual HTML preview instead of unsupported text preview;
- Core artifact file source recovery from locked runtime selection when action
  payload omits private `workspaceGrantId`;
- no dependency on Microsoft PowerPoint for baseline Desktop.

PTX-4 closes the baseline PPTX visual preview path. Future pixel-perfect
render-to-image/PDF, slide thumbnail export, animation handling, and Office-grade
layout validation remain separate gated hardening work.

## 14. Structural Golden Strategy

Do not use binary PPTX SHA-256 as the primary correctness assertion. PPTX is a
ZIP/OOXML package and may include nondeterministic metadata, relationship order,
or ZIP headers.

Primary assertions:

```text
ZIP opens
required OOXML parts exist
slide count matches
text content exists
image relation exists
table nodes exist
chart nodes exist
presentation can be reparsed
consumer can open the file
```

Digest may still be used for publication/recovery material after bytes are
generated, but not as the main semantic golden for writer correctness.

## 15. Typed Error Draft

PTX should reuse existing Document Worker / Core error style where possible.

Expected detail codes:

```text
invalid_presentation_spec
unsupported_presentation_feature
invalid_template_ref
resource_source_unsupported
resource_url_blocked
resource_dns_blocked
resource_redirect_blocked
resource_content_type_mismatch
resource_magic_mismatch
resource_too_large
resource_timed_out
output_too_large
target_exists
publish_failed
consumer_open_failed
```

Top-level code mapping must be frozen in PTX-1/PTX-2 against the current
Document Worker protocol. PTX-0 does not invent public Contract errors.

## 16. QA Matrix

PTX-3 cannot close until the implemented chain covers:

- Chinese text;
- multi-paragraph text;
- table;
- image from artifact/workspace reference;
- URL image resolution;
- basic chart;
- shape;
- 16:9 and 4:3 layout;
- built-in `templateRef`;
- long text bound;
- element count bound;
- output size bound;
- illegal `templateRef` rejection;
- illegal image source rejection;
- DNS rebinding defense;
- connect using same resolved IP;
- post-connect `remoteAddress` verification;
- manual redirect handling;
- redirect count bound;
- magic bytes validation;
- declared Content-Type / magic mismatch rejection;
- image size and timeout;
- Workspace path traversal rejection;
- target exists no-clobber;
- overwrite confirmation when overwrite is enabled;
- Worker timeout;
- Worker crash;
- ResourceResolver failure;
- publication failure after bytes generation;
- Artifact record correctness;
- `.pptx` opens in a real consumer such as Office, LibreOffice, Keynote, or
  Google Slides import.

## 17. Static and Architecture Scans

PTX implementation batches must prove:

- `PptxWriterAdapter` source contains no `http`, `https`, `fetch`, `net`, `tls`,
  `dns`, `fs.readFile` for arbitrary paths, Cookie, Credential, or URL fetch
  behavior;
- model-visible schema contains no PptxGenJS method names;
- public schema contains no workspaceRoot, rootRealPath, FileHandle, fd,
  Credential reference, Cookie, Authorization header, or raw URL fetch options;
- no macros, OLE, embedded object, video, remote media, or arbitrary XML support;
- no new dependency outside the authorized PTX dependency window;
- no `artifact.preview` model Tool registration.

## 18. Known Residual Risks

- PptxGenJS output may render differently across PowerPoint, Keynote,
  LibreOffice, and Google Slides. PTX P0 validates structural correctness and at
  least one real consumer, not perfect visual parity.
- Generic Preview does not catch visual layout bugs such as overlap or text
  overflow. Visual slide rendering remains PTX-4.
- Remote URL images introduce network policy complexity; the ResourceResolver
  constraints above are mandatory before URL images can be production-enabled.
- Enterprise template import is intentionally excluded.

## 19. Estimated Work

```text
PTX-0: 0.5-1.0 focused engineering day, docs-only
PTX-1: 3-5 focused engineering days
PTX-2: 3-5 focused engineering days
PTX-3: 2-3 focused engineering days
PTX-4: 3-7 focused engineering days, depending on renderer choice
```

Estimates exclude independent QA, review churn, and user acceptance.

## 20. PTX-0 Deliverables

This PTX-0 batch delivers:

- this development plan;
- `PresentationSpecV1` contract shape;
- ResourceResolver hard rules;
- dependency window requirements;
- Artifact / Preview boundary;
- PTX-1 through PTX-4 gate map;
- QA and static scan matrix.

PTX-0 is `PASS/CLOSED` after independent review and user acceptance. PTX-1 was
separately authorized and completed as `0.0.0-ptx.1`. PTX-2 was separately
authorized, implemented, repaired, independently retested, accepted by the user,
and closed as `PASS/CLOSED` via `0.0.0-ptx.2`. PTX-3 was separately authorized,
implemented, independently QA'd, and accepted by the user as `PASS/CLOSED` via
`0.0.0-ptx.3`. PTX-4 was separately authorized and implemented as
`0.0.0-ptx.4`. Independent QA passed in a non-sandbox environment; the only
reported P1 was the cross-window `audit:dtp4` Core version expectation after
DFI-5.2.2 advanced Core to `0.0.0-dfi.5.2.2`. The audit baseline was reconciled
to the current package versions. The user formally accepted and closed PTX-4, so
PTX-0 through PTX-4 are now `PASS/CLOSED`.
