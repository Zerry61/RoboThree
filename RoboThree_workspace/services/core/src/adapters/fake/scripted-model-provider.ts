import {
  ModelRequestSchema,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";

import { calculateModelRequestDigest } from "../../application/model-message-converter.js";
import type { ModelProvider } from "../../ports/model-provider.js";
import { validateModelStreamScript } from "../../reliability/model-stream-validator.js";

export class ScriptedModelProvider implements ModelProvider {
  readonly adapterKind = "model_provider" as const;
  readonly adapterDescriptorId = "adapter.model.scripted";
  readonly adapterDescriptorRevision = `sha256:${"0".repeat(64)}`;
  readonly requests: ModelRequest[] = [];
  readonly #scripts: readonly (readonly ModelStreamEvent[])[];

  constructor(scripts: readonly (readonly ModelStreamEvent[])[]) {
    if (scripts.length === 0) throw new Error("ScriptedModelProvider requires a script");
    this.#scripts = scripts.map((script) => validateModelStreamScript(script));
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const parsed = ModelRequestSchema.parse(request);
    if (calculateModelRequestDigest(parsed) !== parsed.requestDigest) {
      throw new Error("ModelRequest digest does not match its canonical content");
    }
    const script = this.#scripts[this.requests.length];
    if (script === undefined) throw new Error("ScriptedModelProvider is exhausted");
    this.requests.push(structuredClone(parsed));
    for (const event of script) {
      if (signal.aborted) return;
      yield event;
      await Promise.resolve();
    }
  }
}
