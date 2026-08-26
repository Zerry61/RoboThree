# DTP-1C.0 DOCX Parser Decision Spike

## Decision

```text
REJECT_MAMMOTH_AND_PROPOSE_CONTROLLED_OOXML_PARSER
```

`mammoth@1.12.0` 不进入生产 DOCX parser。DTP-1C.1 如获用户单独授权，应建设受控
OOXML parser：复用 DTP-1B central-directory/package preflight 思路，只读取白名单
WordprocessingML XML part，并由 RoboThree 自己产生稳定 block 与 locator。

## Scope

DTP-1C.0 是决策 Spike，不是 DOCX `read` 实现。

本批允许：

- 安装 `mammoth@1.12.0` 作为 `@robothree/document-worker` evaluation-only devDependency；
- 在测试中读取 Mammoth 内部 AST 评估结构能力；
- 构建手写 DOCX ZIP fixture 和安全矩阵；
- 更新版本、开发记录与讨论区结论。

本批禁止：

- 生产 `src/**` 导入 `mammoth`、`jszip` 或 DOCX parser；
- 实现 `tool.document.docx.read`；
- 注册正式 Tool、接入 Core Adapter、修改 Contracts/Desktop/Central/正式 ADR/默认 Agent；
- 进入 DTP-1C.1。

## Mammoth Evidence

Package metadata:

```text
name: mammoth
version: 1.12.0
license: BSD-2-Clause
runtime dependencies: 10
optionalDependencies: {}
unpacked size: 2.3M
prepare script: make mammoth.browser.min.js
```

Runtime dependencies:

```text
@xmldom/xmldom
argparse
base64-js
bluebird
dingbat-to-unicode
jszip
lop
path-is-absolute
underscore
xmlbuilder
```

Public API evidence:

- Public API is conversion-oriented: `convertToHtml`, `convertToMarkdown`, `convert`,
  `extractRawText`, image transforms and style-map helpers.
- There is no public structured `readDocument` API for a stable DOCX AST.
- Avoiding HTML output requires importing undocumented internal paths:
  `mammoth/lib/unzip` and `mammoth/lib/docx/docx-reader`.

Security evidence:

- `externalFileAccess` defaults to false in Mammoth options and disabled reads reject external image access.
- Mammoth package code still contains path-based input support and external file read code paths when
  `externalFileAccess` is enabled; production use would need a wrapper that permanently forbids path input
  and external file access.
- Mammoth ZIP path uses `jszip`; DTP-1C.0 did not accept `jszip` as a production parser dependency.
- The package declares a `prepare` script. It was not used as a production dependency in this Spike, but it
  is a supply-chain concern for accepting Mammoth into production.

## Structured Mapping Evidence

The Spike harness uses a hand-written minimal DOCX ZIP fixture, with no docx/pdfkit/ZIP fixture builder.

Verified positive mapping through Mammoth internal AST:

- heading paragraph: stable ordinal paragraph locator can be synthesized;
- normal paragraph: Unicode and Chinese text preserved;
- list item order: two list paragraphs remain ordered;
- table: table/row/cell structure is present;
- merged cells: `gridSpan` maps to `colSpan`; `vMerge` maps to `rowSpan`;
- no HTML string is emitted by the Spike mapper.

Locator evidence:

```text
sectionIndex: synthesized as 1 only
paragraphIndex: ordinal from Mammoth AST
tableIndex: ordinal from Mammoth AST
rowIndex: ordinal from Mammoth AST
cellIndex: ordinal from Mammoth AST
```

Blocking gap:

- Mammoth ignores `w:sectPr` in `lib/docx/body-reader.js`.
- The AST has no `section` node, no `sectPr` node and no raw section property.
- Therefore Mammoth cannot prove stable section locators required by DTP-1C.0.

This is the decisive failure. The rejection is not based on raw text quality.

## Safety Matrix

The DTP-1C.0 Spike preflight fails closed before Mammoth for:

```text
.docm extension
macro-enabled content type
word/vbaProject.bin / *.bin active content
external relationship / external URI
zip slip via backslash, absolute path, drive path, UNC, null byte, dot and dotdot segment
encrypted ZIP entry
corrupt/truncated ZIP
missing required DOCX parts
unsupported ZIP compression method
entry compression ratio over budget
```

The preflight in this Spike is evidence only. It is not a production DOCX parser.

## Exit Rationale

Mammoth is rejected for production DOCX parsing because:

1. It cannot satisfy the DTP-1C.0 section locator requirement.
2. It requires undocumented internal modules to avoid HTML output and obtain structure.
3. Its public API is designed around HTML/Markdown/raw text conversion, not RoboThree canonical blocks.
4. It adds a `jszip` parser surface and a package `prepare` script to the accepted runtime risk set.
5. A controlled OOXML parser can reuse DTP-1B's fail-closed package preflight and expose exact locator semantics
   without depending on Mammoth internal APIs.

## DTP-1C.1 Recommendation

If DTP-1C.1 is separately authorized, implement a controlled DOCX reader with these boundaries:

- no Mammoth production dependency;
- no `jszip`, `yauzl`, `adm-zip` or uncontrolled ZIP parser without separate supply-chain review;
- reuse or generalize DTP-1B central-directory parser for OOXML packages;
- allow only `.docx`, reject `.docm`;
- read only whitelisted XML parts:
  `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`,
  optional `word/styles.xml`, optional `word/numbering.xml`;
- reject macros, embeddings, ActiveX, custom XML, external relationships, external URI, encrypted ZIP,
  ZIP64, multi-disk and compression ratio abuse before XML parsing;
- build canonical `blocks[]` directly from WordprocessingML:
  `heading`, `paragraph`, `list_item`, `table`;
- produce owned locators:
  `sectionIndex`, `blockIndex`, `paragraphIndex`, `tableIndex`, `rowIndex`, `cellIndex`;
- preserve stable order and enforce output, block, table, row, cell and text budgets;
- keep ParserExecutionBoundary as the only execution boundary and Runtime as the only terminal owner.

## Verification

```text
pnpm --config.verify-deps-before-run=false exec vitest run services/document-worker/tests/docx/docx-parser-decision-spike.test.ts
→ 1 file / 4 tests PASS

pnpm --config.verify-deps-before-run=false exec vitest run services/document-worker/tests
→ 20 files / 151 tests PASS
```
