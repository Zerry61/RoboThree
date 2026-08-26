import { z } from "zod";

import { CONTRACT_VERSION, ReadableContractVersionSchema } from "../common/version.js";
import { JsonValueSchema } from "../runtime/json.js";
import type { JsonValue } from "../runtime/json.js";

export const Sha256DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const PersistenceSchemaVersion = CONTRACT_VERSION;
export const PersistenceSchemaVersionSchema = ReadableContractVersionSchema;

export function canonicalJsonStringify(input: JsonValue): string {
  return JSON.stringify(sortJsonValue(JsonValueSchema.parse(input)));
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;
