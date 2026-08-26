import { computeErrorDigest, computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";
import {
  readDocxXmlEntry,
  validateDocxOoxmlPreflight,
} from "./docx-ooxml-preflight.js";

import type { DocxReadOptions } from "../handlers/index.js";
import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";

type DocxReadRequest = Readonly<{
  bytes: Uint8Array;
  extension: string;
  limits: DocumentWorkerLimits;
  options: DocxReadOptions;
}>;

type DocxOutput = Readonly<{
  format: "docx";
  blocks: readonly DocxBlock[];
  metadata: {
    sectionCount: number;
  };
}>;

type DocxBlock = Readonly<
  | {
      kind: "heading" | "paragraph" | "list_item";
      locator: DocxLocator;
      content: string;
    }
  | {
      kind: "table";
      locator: DocxLocator;
      rows: readonly DocxTableRow[];
    }
>;

type DocxTableRow = Readonly<{
  locator: DocxLocator;
  cells: readonly DocxTableCell[];
}>;

type DocxTableCell = Readonly<{
  locator: DocxLocator;
  content: string;
  colSpan: number;
  rowSpan: number;
}>;

type DocxLocator = Readonly<{
  sectionIndex: number;
  blockIndex?: number;
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
}>;

type XmlNode = XmlElement | XmlText;

type XmlElement = {
  type: "element";
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
};

type XmlText = Readonly<{
  type: "text";
  value: string;
}>;

type StyleInfo = Readonly<{
  id: string;
  name: string | null;
}>;

const DEFAULT_MAX_BLOCKS = 10_000;
const DEFAULT_MAX_TEXT_BYTES = 1_000_000;
const DEFAULT_MAX_TABLE_ROWS = 5_000;
const DEFAULT_MAX_TABLE_CELLS = 50_000;

export async function readDocx(
  request: DocxReadRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  const preflight = validateDocxOoxmlPreflight(
    request.bytes,
    request.extension,
    request.limits,
  );
  const documentXml = requiredXml(
    readDocxXmlEntry(request.bytes, preflight.entries, "word/document.xml"),
    "word/document.xml",
  );
  const stylesXml = readDocxXmlEntry(request.bytes, preflight.entries, "word/styles.xml");
  const output = buildOutput(documentXml, stylesXml, request);
  const outputBytes = Buffer.byteLength(JSON.stringify(output), "utf8");
  if (outputBytes > request.limits.maxOutputBytes) {
    throw typedError("limit_exceeded", "DOCX output exceeds configured limit", "docx_output");
  }

  const metadata: DocumentWorkerResultMetadata = {
    originalCount: output.blocks.length,
    returnedCount: output.blocks.length,
    truncated: false,
    resultDigest: computeResultDigest(output),
    locators: output.blocks.flatMap(blockLocators),
    timingMs: Date.now() - startedAt,
  };
  return { output, metadata };
}

function buildOutput(
  documentXml: string,
  stylesXml: string | null,
  request: DocxReadRequest,
): DocxOutput {
  const document = parseXml(documentXml);
  const styles = stylesXml === null ? new Map<string, StyleInfo>() : parseStyles(stylesXml);
  const body = firstDescendant(document, "w:body");
  if (body === null) {
    throw typedError("invalid_format", "DOCX document body is missing", "docx_body");
  }

  const blocks: DocxBlock[] = [];
  let sectionIndex = 1;
  let sectionCount = 1;
  let blockIndex = 0;
  let paragraphIndex = 0;
  let tableIndex = 0;

  for (const child of childElements(body)) {
    if (child.name === "w:p") {
      paragraphIndex += 1;
      const hasSectionBreak = firstDescendant(child, "w:sectPr") !== null;
      const content = sanitizeText(textOfParagraph(child), request);
      if (content.length > 0) {
        blockIndex += 1;
        blocks.push({
          kind: paragraphKind(child, styles),
          locator: { sectionIndex, blockIndex, paragraphIndex },
          content,
        });
        enforceBlockLimit(blocks, request);
      }
      if (hasSectionBreak) {
        sectionIndex += 1;
        sectionCount = Math.max(sectionCount, sectionIndex);
      }
    } else if (child.name === "w:tbl") {
      tableIndex += 1;
      blockIndex += 1;
      blocks.push({
        kind: "table",
        locator: { sectionIndex, blockIndex, tableIndex },
        rows: readTable(child, sectionIndex, tableIndex, request),
      });
      enforceBlockLimit(blocks, request);
    } else if (child.name === "w:sectPr") {
      sectionCount = Math.max(sectionCount, sectionIndex);
    }
  }

  return {
    format: "docx",
    blocks,
    metadata: {
      sectionCount,
    },
  };
}

function readTable(
  table: XmlElement,
  sectionIndex: number,
  tableIndex: number,
  request: DocxReadRequest,
): DocxTableRow[] {
  const rows: DocxTableRow[] = [];
  const verticalMergeByColumn = new Map<number, DocxTableCell>();
  let totalCells = 0;
  for (const rowElement of childElements(table).filter((child) => child.name === "w:tr")) {
    if (rows.length + 1 > (request.options.maxTableRows ?? DEFAULT_MAX_TABLE_ROWS)) {
      throw typedError("limit_exceeded", "DOCX table row count exceeds configured limit", "docx_table_rows");
    }
    const cells: DocxTableCell[] = [];
    let columnIndex = 1;
    for (const cellElement of childElements(rowElement).filter((child) => child.name === "w:tc")) {
      const colSpan = positiveIntegerAttribute(
        firstDescendant(cellElement, "w:gridSpan"),
        "w:val",
      ) ?? 1;
      const vMerge = attribute(firstDescendant(cellElement, "w:vMerge"), "w:val");
      if ((vMerge === null || vMerge === "continue") && firstDescendant(cellElement, "w:vMerge") !== null) {
        const origin = verticalMergeByColumn.get(columnIndex);
        if (origin !== undefined) {
          (origin as { rowSpan: number }).rowSpan += 1;
          columnIndex += colSpan;
          continue;
        }
      }
      const cell: DocxTableCell = {
        locator: {
          sectionIndex,
          tableIndex,
          rowIndex: rows.length + 1,
          cellIndex: cells.length + 1,
        },
        content: sanitizeText(textOfElement(cellElement), request),
        colSpan,
        rowSpan: 1,
      };
      cells.push(cell);
      verticalMergeByColumn.set(columnIndex, cell);
      totalCells += 1;
      if (totalCells > (request.options.maxTableCells ?? DEFAULT_MAX_TABLE_CELLS)) {
        throw typedError("limit_exceeded", "DOCX table cell count exceeds configured limit", "docx_table_cells");
      }
      columnIndex += colSpan;
    }
    rows.push({
      locator: { sectionIndex, tableIndex, rowIndex: rows.length + 1 },
      cells,
    });
  }
  return rows;
}

function paragraphKind(
  paragraph: XmlElement,
  styles: ReadonlyMap<string, StyleInfo>,
): "heading" | "paragraph" | "list_item" {
  if (firstDescendant(paragraph, "w:numPr") !== null) {
    return "list_item";
  }
  const styleId = attribute(firstDescendant(paragraph, "w:pStyle"), "w:val");
  if (styleId !== null) {
    const style = styles.get(styleId);
    if (/^heading\d+$/i.test(styleId) || /^heading\s+\d+$/i.test(style?.name ?? "")) {
      return "heading";
    }
  }
  return "paragraph";
}

function parseStyles(stylesXml: string): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  const root = parseXml(stylesXml);
  for (const style of descendants(root, "w:style")) {
    if (attribute(style, "w:type") !== "paragraph") {
      continue;
    }
    const id = attribute(style, "w:styleId");
    if (id === null) {
      continue;
    }
    styles.set(id, {
      id,
      name: attribute(firstDescendant(style, "w:name"), "w:val"),
    });
  }
  return styles;
}

function parseXml(text: string): XmlElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw typedError("unsupported_feature", "DOCX XML entities and DTDs are not supported", "docx_xml_entity");
  }
  const root: XmlElement = {
    type: "element",
    name: "#document",
    attributes: {},
    children: [],
  };
  const stack: XmlElement[] = [root];
  const tokenPattern = /<[^>]*>|[^<]+/g;
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    if (token.startsWith("<?") || token.startsWith("<!--")) {
      continue;
    }
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      const current = stack.pop();
      if (current === undefined || current.name !== name || stack.length === 0) {
        throw typedError("corrupt", "DOCX XML has mismatched tags", "docx_xml_mismatch");
      }
      continue;
    }
    if (token.startsWith("<")) {
      if (token.startsWith("<!")) {
        throw typedError("unsupported_feature", "DOCX XML declaration is unsupported", "docx_xml_markup");
      }
      const selfClosing = /\/\s*>$/.test(token);
      const inner = token.slice(1, selfClosing ? token.lastIndexOf("/") : -1).trim();
      const space = inner.search(/\s/);
      const name = space === -1 ? inner : inner.slice(0, space);
      const attrText = space === -1 ? "" : inner.slice(space + 1);
      const element: XmlElement = {
        type: "element",
        name,
        attributes: parseAttributes(attrText),
        children: [],
      };
      stack[stack.length - 1]!.children.push(element);
      if (!selfClosing) {
        stack.push(element);
      }
      continue;
    }
    stack[stack.length - 1]!.children.push({
      type: "text",
      value: decodeXmlText(token),
    });
  }
  if (stack.length !== 1) {
    throw typedError("corrupt", "DOCX XML has unclosed tags", "docx_xml_unclosed");
  }
  const elements = childElements(root);
  if (elements.length !== 1) {
    throw typedError("invalid_format", "DOCX XML root is invalid", "docx_xml_root");
  }
  return elements[0]!;
}

function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrPattern = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
  for (const match of text.matchAll(attrPattern)) {
    attributes[match[1]!] = decodeXmlText(match[3]!);
  }
  return attributes;
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textOfParagraph(paragraph: XmlElement): string {
  return childElements(paragraph)
    .filter((child) => child.name !== "w:pPr")
    .map(textOfElement)
    .join("");
}

function textOfElement(element: XmlElement): string {
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      if (element.name === "w:t") {
        text += child.value;
      }
    } else if (child.name === "w:tab") {
      text += "\t";
    } else if (child.name === "w:br") {
      text += "\n";
    } else if (child.name === "w:t") {
      text += child.children
        .filter((candidate): candidate is XmlText => candidate.type === "text")
        .map((candidate) => candidate.value)
        .join("");
    } else {
      text += textOfElement(child);
    }
  }
  return text;
}

function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.type === "element");
}

function descendants(element: XmlElement, name: string): XmlElement[] {
  const matches: XmlElement[] = [];
  for (const child of childElements(element)) {
    if (child.name === name) {
      matches.push(child);
    }
    matches.push(...descendants(child, name));
  }
  return matches;
}

function firstDescendant(element: XmlElement, name: string): XmlElement | null {
  for (const child of childElements(element)) {
    if (child.name === name) {
      return child;
    }
    const descendant = firstDescendant(child, name);
    if (descendant !== null) {
      return descendant;
    }
  }
  return null;
}

function attribute(element: XmlElement | null, name: string): string | null {
  return element?.attributes[name] ?? null;
}

function positiveIntegerAttribute(
  element: XmlElement | null,
  name: string,
): number | null {
  const value = attribute(element, name);
  if (value === null) {
    return null;
  }
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw typedError("invalid_format", "DOCX numeric XML attribute is invalid", "docx_xml_number");
  }
  return Number.parseInt(value, 10);
}

function sanitizeText(text: string, request: DocxReadRequest): string {
  let sanitized = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      continue;
    }
    sanitized += text[index];
  }
  const maxBytes = request.options.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES;
  if (Buffer.byteLength(sanitized, "utf8") > maxBytes) {
    throw typedError("limit_exceeded", "DOCX text exceeds configured limit", "docx_text");
  }
  return sanitized;
}

function enforceBlockLimit(
  blocks: readonly DocxBlock[],
  request: DocxReadRequest,
): void {
  if (blocks.length > (request.options.maxBlocks ?? DEFAULT_MAX_BLOCKS)) {
    throw typedError("limit_exceeded", "DOCX block count exceeds configured limit", "docx_blocks");
  }
}

function blockLocators(block: DocxBlock): Record<string, unknown>[] {
  if (block.kind !== "table") {
    return [block.locator];
  }
  return [
    block.locator,
    ...block.rows.flatMap((row) => [
      row.locator,
      ...row.cells.map((cell) => cell.locator),
    ]),
  ];
}

function requiredXml(value: string | null, name: string): string {
  if (value === null) {
    throw typedError("invalid_format", `DOCX required XML is missing: ${name}`, "docx_required_xml");
  }
  return value;
}

function typedError(
  code: "invalid_format" | "corrupt" | "limit_exceeded" | "unsupported_feature",
  message: string,
  digestKey: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, digestKey),
  );
}
