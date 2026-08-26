import { createHash } from "node:crypto";

import { Sha256DigestSchema, canonicalJsonStringify } from "@robothree/contracts";
import type { JsonValue, Sha256Digest } from "@robothree/contracts";

export function sha256CanonicalJson(value: JsonValue): Sha256Digest {
  const hex = createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
  return Sha256DigestSchema.parse(`sha256:${hex}`);
}
