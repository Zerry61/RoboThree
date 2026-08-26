export type PdfFixturePage = Readonly<{
  text?: string;
  textRuns?: readonly PdfFixtureTextRun[];
  unicodeText?: string;
  rotate?: number;
  blank?: boolean;
}>;

export type PdfFixtureTextRun = Readonly<{
  text: string;
  x: number;
  y: number;
  fontSize?: number;
}>;

export function makePdfFixture(pages: readonly PdfFixturePage[]): Uint8Array {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const unicodeMap = buildUnicodeMap(pages);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  if (unicodeMap.size > 0) {
    objects[4] = [
      "<<",
      "/Type /Font",
      "/Subtype /Type0",
      "/BaseFont /RoboThreeUnicode",
      "/Encoding /Identity-H",
      "/DescendantFonts [5 0 R]",
      "/ToUnicode 6 0 R",
      ">>",
    ].join("\n");
    objects[5] = [
      "<<",
      "/Type /Font",
      "/Subtype /CIDFontType2",
      "/BaseFont /RoboThreeUnicode",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>",
      "/FontDescriptor 7 0 R",
      ">>",
    ].join("\n");
    objects[6] = unicodeCMapStream(unicodeMap);
    objects[7] = [
      "<<",
      "/Type /FontDescriptor",
      "/FontName /RoboThreeUnicode",
      "/Flags 4",
      "/FontBBox [0 -200 1000 900]",
      "/ItalicAngle 0",
      "/Ascent 880",
      "/Descent -120",
      "/CapHeight 700",
      "/StemV 80",
      ">>",
    ].join("\n");
  }

  for (const page of pages) {
    const pageObjectId = objects.length;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    objects[pageObjectId] = [
      "<<",
      "/Type /Page",
      "/Parent 2 0 R",
      unicodeMap.size === 0
        ? "/Resources << /Font << /F1 3 0 R >> >>"
        : "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>",
      "/MediaBox [0 0 612 792]",
      page.rotate === undefined ? "" : `/Rotate ${page.rotate}`,
      `/Contents ${contentObjectId} 0 R`,
      ">>",
    ].filter(Boolean).join("\n");

    const stream = page.blank === true ? "" : textStream(page, unicodeMap);
    objects[contentObjectId] = [
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>`,
      "stream",
      stream,
      "endstream",
    ].join("\n");
  }

  objects[2] = [
    "<< /Type /Pages",
    `/Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}]`,
    `/Count ${pageObjectIds.length}`,
    ">>",
  ].join("\n");

  return serializePdf(objects);
}

export function makeCorruptPdfFixture(): Uint8Array {
  return exactBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n");
}

export function makeEncryptedLikePdfFixture(): Uint8Array {
  return serializePdf([
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
    "<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>",
  ], "3 0 R");
}

function textStream(
  page: PdfFixturePage,
  unicodeMap: ReadonlyMap<number, number>,
): string {
  if (page.textRuns !== undefined) {
    return page.textRuns.map((run) => textRunStream(run)).join("\n");
  }
  const encodedText = page.unicodeText === undefined
    ? pdfLiteral(page.text ?? "")
    : cidPdfHex(page.unicodeText, unicodeMap);
  return [
    "BT",
    page.unicodeText === undefined ? "/F1 12 Tf" : "/F2 12 Tf",
    "72 720 Td",
    `${encodedText} Tj`,
    "ET",
  ].join("\n");
}

function textRunStream(run: PdfFixtureTextRun): string {
  return [
    "BT",
    `/F1 ${run.fontSize ?? 10} Tf`,
    `1 0 0 1 ${run.x} ${run.y} Tm`,
    `${pdfLiteral(run.text)} Tj`,
    "ET",
  ].join("\n");
}

function pdfLiteral(text: string): string {
  return `(${text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")})`;
}

function buildUnicodeMap(pages: readonly PdfFixturePage[]): Map<number, number> {
  const map = new Map<number, number>();
  let nextCid = 1;
  for (const page of pages) {
    if (page.unicodeText === undefined) {
      continue;
    }
    for (let index = 0; index < page.unicodeText.length; index += 1) {
      const codeUnit = page.unicodeText.charCodeAt(index);
      if (!map.has(codeUnit)) {
        map.set(codeUnit, nextCid);
        nextCid += 1;
      }
    }
  }
  return map;
}

function cidPdfHex(text: string, unicodeMap: ReadonlyMap<number, number>): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    const cid = unicodeMap.get(codeUnit);
    if (cid === undefined) {
      throw new Error("Missing unicode CID mapping");
    }
    bytes.push((cid >> 8) & 0xff, cid & 0xff);
  }
  return `<${Buffer.from(bytes).toString("hex").toUpperCase()}>`;
}

function unicodeCMapStream(unicodeMap: ReadonlyMap<number, number>): string {
  const mappings = Array.from(unicodeMap.entries())
    .map(([codeUnit, cid]) =>
      `<${cid.toString(16).padStart(4, "0").toUpperCase()}> <${codeUnit
        .toString(16)
        .padStart(4, "0")
        .toUpperCase()}>`
    );
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /RoboThreeUnicode-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${mappings.length} beginbfchar`,
    ...mappings,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  return [
    `<< /Length ${Buffer.byteLength(cmap, "ascii")} >>`,
    "stream",
    cmap,
    "endstream",
  ].join("\n");
}

function serializePdf(
  objects: readonly string[],
  encryptObjectRef?: string,
): Uint8Array {
  let body = "%PDF-1.4\n% RoboThree DTP fixture\n";
  const offsets: number[] = [0];
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(body, "ascii");
    body += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length}\n`;
  body += "0000000000 65535 f \n";
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    body += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  body += [
    "trailer",
    `<< /Size ${objects.length} /Root 1 0 R${encryptObjectRef === undefined ? "" : ` /Encrypt ${encryptObjectRef}`} >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  return exactBytes(body);
}

function exactBytes(text: string): Uint8Array {
  const buffer = Buffer.from(text, "ascii");
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(buffer);
  return bytes;
}
