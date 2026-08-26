import { deflateRawSync } from "node:zlib";

export type DocxFixtureOptions = Readonly<{
  extension?: "docx" | "docm";
  includeMacro?: boolean;
  externalRelationship?: boolean;
  includeSectionBreak?: boolean;
  zipSlipEntryName?: string;
  encryptFirstEntry?: boolean;
}>;

type ZipEntryInput = Readonly<{
  name: string;
  data: Uint8Array | string;
}>;

export function makeDocxSpikeFixture(options: DocxFixtureOptions = {}): Uint8Array {
  const entries: ZipEntryInput[] = [
    {
      name: "[Content_Types].xml",
      data: contentTypesXml(options),
    },
    {
      name: "_rels/.rels",
      data: rootRelationshipsXml(),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: documentRelationshipsXml(options),
    },
    {
      name: "word/document.xml",
      data: documentXml(options),
    },
    {
      name: "word/styles.xml",
      data: stylesXml(),
    },
    {
      name: "word/numbering.xml",
      data: numberingXml(),
    },
  ];
  if (options.includeMacro) {
    entries.push({ name: "word/vbaProject.bin", data: new Uint8Array([1, 2, 3, 4]) });
  }
  if (options.zipSlipEntryName) {
    entries.push({ name: options.zipSlipEntryName, data: "unsafe" });
  }
  return writeZip(entries, { encryptFirstEntry: options.encryptFirstEntry === true });
}

export function truncateDocx(bytes: Uint8Array): Uint8Array {
  return exactBytes(bytes.subarray(0, Math.max(4, bytes.byteLength - 48)));
}

function contentTypesXml(options: DocxFixtureOptions): string {
  const documentContentType = options.extension === "docm"
    ? "application/vnd.ms-word.document.macroEnabled.main+xml"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  const binDefault = options.includeMacro
    ? `<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>`
    : "";
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${binDefault}
  <Override PartName="/word/document.xml" ContentType="${documentContentType}"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`);
}

function rootRelationshipsXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`);
}

function documentRelationshipsXml(options: DocxFixtureOptions): string {
  const external = options.externalRelationship
    ? `<Relationship Id="rExt"
        Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
        TargetMode="External"
        Target="file:///private/tmp/secret.png"/>`
    : "";
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${external}
</Relationships>`);
}

function documentXml(options: DocxFixtureOptions): string {
  const section = options.includeSectionBreak
    ? `<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr></w:p>`
    : "";
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>标题 Alpha</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>段落 Unicode 你好 β</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>列表一</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>列表二</w:t></w:r>
    </w:p>
    ${section}
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
          <w:p><w:r><w:t>合并单元格</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>右上</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:r><w:t>跨行</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>右下</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge/></w:tcPr>
          <w:p><w:r><w:t>忽略的续接格</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>尾格</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr><w:type w:val="continuous"/></w:sectPr>
  </w:body>
</w:document>`);
}

function stylesXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
  </w:style>
</w:styles>`);
}

function numberingXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="1"/>
  </w:num>
</w:numbering>`);
}

function writeZip(
  entries: readonly ZipEntryInput[],
  options: Readonly<{ encryptFirstEntry: boolean }>,
): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [index, entry] of entries.entries()) {
    const name = Buffer.from(entry.name, "utf8");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const flags = options.encryptFirstEntry && index === 0 ? 0x0001 : 0;
    const local = Buffer.alloc(30 + name.byteLength + compressed.byteLength);
    writeUInt32(local, 0, 0x04034b50);
    writeUInt16(local, 4, 20);
    writeUInt16(local, 6, flags);
    writeUInt16(local, 8, 8);
    writeUInt16(local, 10, 0);
    writeUInt16(local, 12, 0);
    writeUInt32(local, 14, crc);
    writeUInt32(local, 18, compressed.byteLength);
    writeUInt32(local, 22, data.byteLength);
    writeUInt16(local, 26, name.byteLength);
    writeUInt16(local, 28, 0);
    name.copy(local, 30);
    compressed.copy(local, 30 + name.byteLength);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.byteLength);
    writeUInt32(central, 0, 0x02014b50);
    writeUInt16(central, 4, 20);
    writeUInt16(central, 6, 20);
    writeUInt16(central, 8, flags);
    writeUInt16(central, 10, 8);
    writeUInt16(central, 12, 0);
    writeUInt16(central, 14, 0);
    writeUInt32(central, 16, crc);
    writeUInt32(central, 20, compressed.byteLength);
    writeUInt32(central, 24, data.byteLength);
    writeUInt16(central, 28, name.byteLength);
    writeUInt16(central, 30, 0);
    writeUInt16(central, 32, 0);
    writeUInt16(central, 34, 0);
    writeUInt16(central, 36, 0);
    writeUInt32(central, 38, 0);
    writeUInt32(central, 42, offset);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.byteLength;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  writeUInt32(eocd, 0, 0x06054b50);
  writeUInt16(eocd, 4, 0);
  writeUInt16(eocd, 6, 0);
  writeUInt16(eocd, 8, entries.length);
  writeUInt16(eocd, 10, entries.length);
  writeUInt32(eocd, 12, centralDirectory.byteLength);
  writeUInt32(eocd, 16, offset);
  writeUInt16(eocd, 20, 0);
  return exactBytes(Buffer.concat([...localParts, centralDirectory, eocd]));
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(buffer: Buffer, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32(buffer: Buffer, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function exactBytes(input: Uint8Array): Uint8Array {
  const arrayBuffer = new ArrayBuffer(input.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(input);
  return bytes;
}

function xml(text: string): string {
  return text.replace(/^\n|\n$/g, "");
}
