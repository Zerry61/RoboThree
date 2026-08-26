import * as XLSX from "xlsx";

export function makeXlsxFixture(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const first = XLSX.utils.aoa_to_sheet([
    ["Name", "Value", "When"],
    ["Alpha", 42, 46238],
    ["Formula", null, "你好\u0000 SheetJS"],
  ]);
  first["C2"]!.z = "yyyy-mm-dd";
  first["B3"] = { t: "n", f: "B2*2", v: 84 };
  XLSX.utils.book_append_sheet(workbook, first, "Visible");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Hidden", true]]),
    "Hidden",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["VeryHidden", "yes"]]),
    "VeryHidden",
  );
  workbook.Workbook ??= {};
  workbook.Workbook.Sheets = [
    { name: "Visible", Hidden: 0 },
    { name: "Hidden", Hidden: 1 },
    { name: "VeryHidden", Hidden: 2 },
  ];

  return exactBytes(XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellDates: false,
  }) as Buffer);
}

export function replaceCentralDirectoryName(
  bytes: Uint8Array,
  original: string,
  replacement: string,
): Uint8Array {
  if (Buffer.byteLength(original, "utf8") !== Buffer.byteLength(replacement, "utf8")) {
    throw new Error("Replacement ZIP name must have the same byte length");
  }
  const copy = exactBytes(bytes);
  const offset = findCentralDirectoryName(copy, original);
  copy.set(Buffer.from(replacement, "utf8"), offset);
  return copy;
}

export function setFirstCentralDirectoryEncrypted(bytes: Uint8Array): Uint8Array {
  const copy = exactBytes(bytes);
  const offset = findCentralDirectory(copy);
  const flags = copy[offset + 8]! | (copy[offset + 9]! << 8) | 0x0001;
  copy[offset + 8] = flags & 0xff;
  copy[offset + 9] = (flags >> 8) & 0xff;
  return copy;
}

export function setFirstCentralDirectoryUncompressedSize(
  bytes: Uint8Array,
  size: number,
): Uint8Array {
  const copy = exactBytes(bytes);
  const offset = findCentralDirectory(copy);
  copy[offset + 24] = size & 0xff;
  copy[offset + 25] = (size >> 8) & 0xff;
  copy[offset + 26] = (size >> 16) & 0xff;
  copy[offset + 27] = Math.floor(size / 0x1000000) & 0xff;
  return copy;
}

export function truncateXlsx(bytes: Uint8Array): Uint8Array {
  return exactBytes(bytes.subarray(0, Math.max(4, bytes.byteLength - 64)));
}

function exactBytes(input: Uint8Array): Uint8Array {
  const arrayBuffer = new ArrayBuffer(input.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(input);
  return bytes;
}

function findCentralDirectoryName(bytes: Uint8Array, name: string): number {
  const nameBytes = Buffer.from(name, "utf8");
  const centralDirectoryOffset = findCentralDirectory(bytes);
  for (let offset = centralDirectoryOffset; offset + nameBytes.length <= bytes.byteLength; offset += 1) {
    let matched = true;
    for (let index = 0; index < nameBytes.length; index += 1) {
      if (bytes[offset + index] !== nameBytes[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return offset;
    }
  }
  throw new Error(`ZIP central directory name not found: ${name}`);
}

function findCentralDirectory(bytes: Uint8Array): number {
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x01 &&
      bytes[offset + 3] === 0x02
    ) {
      return offset;
    }
  }
  throw new Error("ZIP central directory not found");
}
