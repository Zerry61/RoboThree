import {
  JsonValueSchema,
  ModelRequestSchema,
  type ModelRequest,
} from "@robothree/contracts";
import {
  ModelRequestV1Alpha2MaterialSchema,
  ModelRequestV1Alpha2Schema,
  ReadableModelRequestSchema,
  type ModelRequestV1Alpha2,
  type ModelRequestV1Alpha2Material,
  type ReadableModelRequest,
} from "@robothree/contracts/model-protocol/v1alpha2";

import { sha256CanonicalJson } from "../persistence/digest.js";

export function createModelRequestV1Alpha2(
  material: ModelRequestV1Alpha2Material,
): ModelRequestV1Alpha2 {
  const parsed = ModelRequestV1Alpha2MaterialSchema.parse(material);
  return ModelRequestV1Alpha2Schema.parse({
    ...parsed,
    requestDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function calculateReadableModelRequestDigest(
  request: ReadableModelRequest,
): string {
  const parsed = ReadableModelRequestSchema.parse(request);
  const { requestDigest: _requestDigest, ...material } = parsed;
  return sha256CanonicalJson(JsonValueSchema.parse(material));
}

export function parseReadableModelRequest(input: unknown): ReadableModelRequest {
  const parsed = ReadableModelRequestSchema.parse(input);
  if (calculateReadableModelRequestDigest(parsed) !== parsed.requestDigest) {
    throw new Error("ModelRequest digest does not match its canonical content");
  }
  return parsed;
}

export function calculateLegacyModelRequestDigest(request: ModelRequest): string {
  const parsed = ModelRequestSchema.parse(request);
  const { requestDigest: _requestDigest, ...material } = parsed;
  return sha256CanonicalJson(JsonValueSchema.parse(material));
}
