import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  CatalogQueryError,
  type CatalogCursorCodec,
  type CatalogCursorProof,
} from "../../ports/catalog-query.js";

const PREFIX = "r3cat1";

export class HmacCatalogCursorCodec implements CatalogCursorCodec {
  readonly #key: Buffer;

  constructor(key: Uint8Array = randomBytes(32)) {
    if (key.byteLength < 32) throw new Error("catalog cursor key must be at least 256 bits");
    this.#key = Buffer.from(key);
  }

  seal(proof: CatalogCursorProof): string {
    const payload = Buffer.from(JSON.stringify(proof), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.#key)
      .update(`${PREFIX}.${payload}`, "utf8")
      .digest("base64url");
    return `${PREFIX}.${payload}.${signature}`;
  }

  open(token: string): CatalogCursorProof {
    try {
      const parts = token.split(".");
      if (parts.length !== 3 || parts[0] !== PREFIX) throw invalidCursor();
      const expected = createHmac("sha256", this.#key)
        .update(`${PREFIX}.${parts[1]}`, "utf8")
        .digest();
      const received = Buffer.from(parts[2]!, "base64url");
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw invalidCursor();
      }
      const parsed = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as unknown;
      if (!isProof(parsed)) throw invalidCursor();
      return Object.freeze(parsed);
    } catch (error) {
      if (error instanceof CatalogQueryError) throw error;
      throw invalidCursor();
    }
  }
}

function isProof(value: unknown): value is CatalogCursorProof {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4
    && (record.kind === "robot" || record.kind === "tool")
    && typeof record.queryRevision === "string"
    && /^sha256:[a-f0-9]{64}$/u.test(record.queryRevision)
    && typeof record.lastNormalizedName === "string"
    && record.lastNormalizedName.length <= 512
    && typeof record.lastStableId === "string"
    && record.lastStableId.length >= 3
    && record.lastStableId.length <= 160;
}

function invalidCursor(): CatalogQueryError {
  return new CatalogQueryError(
    "catalog.cursor_invalid",
    "catalog cursor is invalid or belongs to another runtime",
  );
}
