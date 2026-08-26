import {
  ModelRequestSchema,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";

import { calculateModelRequestDigest } from "../../application/model-message-converter.js";
import type { ModelProvider } from "../../ports/model-provider.js";
import { validateModelStreamScript } from "../../reliability/model-stream-validator.js";

export class FakeModelProvider implements ModelProvider {
  readonly adapterKind = "model_provider" as const;
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  readonly #events: readonly ModelStreamEvent[];

  constructor(input: {
    adapterDescriptorId?: string;
    adapterDescriptorRevision?: string;
    events: readonly ModelStreamEvent[];
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId ?? "adapter.model.fake";
    this.adapterDescriptorRevision = input.adapterDescriptorRevision ?? `sha256:${"0".repeat(64)}`;
    this.#events = validateModelStreamScript(input.events);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const parsed = ModelRequestSchema.parse(request);
    if (calculateModelRequestDigest(parsed) !== parsed.requestDigest) {
      throw new Error("ModelRequest digest does not match its canonical content");
    }
    for (const event of this.#events) {
      if (signal.aborted) {
        return;
      }
      yield event;
      await Promise.resolve();
    }
  }
}
