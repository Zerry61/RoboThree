import type { ModelRequest } from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import { parseReadableModelRequest } from "./model-request-revisions.js";

export function requireLegacyModelRequestForUnmappedProvider(
  input: ReadableModelRequest,
): ModelRequest {
  const parsed = parseReadableModelRequest(input);
  if (parsed.schemaVersion === "v1alpha2") {
    throw new ReasoningProtocolUnavailableError();
  }
  return parsed;
}

export class ReasoningProtocolUnavailableError extends Error {
  readonly code = "reasoning_protocol_unavailable" as const;
  readonly retryable = false;
  readonly safeSummary = "The selected model reasoning mapping is not available";

  constructor() {
    super("ModelRequest v1alpha2 reached a Provider without an installed reasoning mapping");
    this.name = "ReasoningProtocolUnavailableError";
  }
}
