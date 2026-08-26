import {
  JsonObjectSchema,
  MODEL_PROTOCOL_VERSION,
  ModelRequestSchema,
} from "@robothree/contracts";
import type {
  JsonObject,
  ModelRequest,
  ModelTarget,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ReducedContext } from "./context-types.js";

export type ModelConversionInput = Readonly<{
  requestId: string;
  model: ModelTarget;
  maxOutputTokens: number;
}>;

export class ModelMessageConverter {
  measurementValue(
    context: ReducedContext,
    input: ModelConversionInput,
  ): JsonObject {
    return JsonObjectSchema.parse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      requestId: input.requestId,
      snapshotId: context.snapshot.snapshotId,
      contextSourceDigest: context.contextSourceDigest,
      model: input.model,
      messages: [
        ...context.instructions.map((instruction) => instruction.message ?? ({
          schemaVersion: MODEL_PROTOCOL_VERSION,
          role: "system" as const,
          sourceId: instruction.sourceId,
          sourceRevision: instruction.sourceRevision,
          sourceDigest: instruction.sourceDigest,
          content: [{ type: "text" as const, text: instruction.content }],
        })),
        ...context.messages,
      ],
      tools: context.tools,
      artifacts: context.artifacts,
      maxOutputTokens: input.maxOutputTokens,
    });
  }

  convert(context: ReducedContext, input: ModelConversionInput): ModelRequest {
    const material = this.measurementValue(context, input);
    return ModelRequestSchema.parse({
      ...material,
      requestDigest: sha256CanonicalJson(material),
    });
  }
}

export function calculateModelRequestDigest(request: ModelRequest): string {
  const parsed = ModelRequestSchema.parse(request);
  const { requestDigest: _requestDigest, ...material } = parsed;
  return sha256CanonicalJson(JsonObjectSchema.parse(material));
}
