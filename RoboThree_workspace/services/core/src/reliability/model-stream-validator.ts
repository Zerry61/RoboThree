import {
  ModelStreamEventSchema,
  type ModelStreamEvent,
} from "@robothree/contracts";

export type ModelStreamProtocolErrorCode =
  | "model_stream.event_invalid"
  | "model_stream.started_missing"
  | "model_stream.started_duplicate"
  | "model_stream.event_after_terminal"
  | "model_stream.terminal_missing"
  | "model_stream.text_delta_blank"
  | "model_stream.tool_call_duplicate"
  | "model_stream.tool_call_identity_conflict"
  | "model_stream.usage_duplicate"
  | "model_stream.usage_regressed";

export class ModelStreamProtocolError extends Error {
  readonly code: ModelStreamProtocolErrorCode;

  constructor(code: ModelStreamProtocolErrorCode, message: string) {
    super(message);
    this.name = "ModelStreamProtocolError";
    this.code = code;
  }
}

/** Core-internal provider-neutral stream state machine. */
export class ModelStreamSequenceValidator {
  readonly #toolCalls = new Map<string, Extract<ModelStreamEvent, { type: "tool_call" }>>();
  readonly #actionOwners = new Map<string, string>();
  #started = false;
  #terminal = false;
  #usage: Extract<ModelStreamEvent, { type: "usage" }> | undefined;

  accept(candidate: unknown): ModelStreamEvent {
    const parsed = ModelStreamEventSchema.safeParse(candidate);
    if (!parsed.success) {
      throw protocol("model_stream.event_invalid", "ModelProvider stream emitted an invalid event");
    }
    const event = parsed.data;
    if (this.#terminal) {
      throw protocol(
        "model_stream.event_after_terminal",
        "ModelProvider stream emitted an event after its terminal event",
      );
    }
    if (!this.#started) {
      if (event.type !== "started") {
        throw protocol(
          "model_stream.started_missing",
          "ModelProvider stream must start with exactly one started event",
        );
      }
      this.#started = true;
      return event;
    }
    if (event.type === "started") {
      throw protocol("model_stream.started_duplicate", "ModelProvider stream emitted started more than once");
    }
    if (event.type === "text_delta" && event.delta.trim().length === 0) {
      throw protocol("model_stream.text_delta_blank", "ModelProvider stream emitted a blank text delta");
    }
    if (event.type === "tool_call") this.#acceptToolCall(event);
    if (event.type === "usage") this.#acceptUsage(event);
    if (event.type === "completed" || event.type === "failed") this.#terminal = true;
    return event;
  }

  finish(): void {
    if (!this.#started) {
      throw protocol(
        "model_stream.started_missing",
        "ModelProvider stream must start with exactly one started event",
      );
    }
    if (!this.#terminal) {
      throw protocol(
        "model_stream.terminal_missing",
        "ModelProvider stream must end with exactly one completed or failed event",
      );
    }
  }

  #acceptToolCall(event: Extract<ModelStreamEvent, { type: "tool_call" }>): void {
    const existing = this.#toolCalls.get(event.call.toolCallId);
    if (existing !== undefined) {
      const sameIdentity = existing.call.taskId === event.call.taskId
        && existing.call.actionId === event.call.actionId
        && existing.call.capabilityId === event.call.capabilityId
        && JSON.stringify(existing.call.arguments) === JSON.stringify(event.call.arguments);
      throw protocol(
        sameIdentity ? "model_stream.tool_call_duplicate" : "model_stream.tool_call_identity_conflict",
        sameIdentity
          ? "ModelProvider stream repeated a Tool Call identity"
          : "ModelProvider stream changed an existing Tool Call identity",
      );
    }
    const actionOwner = this.#actionOwners.get(event.call.actionId);
    if (actionOwner !== undefined && actionOwner !== event.call.toolCallId) {
      throw protocol(
        "model_stream.tool_call_identity_conflict",
        "ModelProvider stream assigned one Action identity to multiple Tool Calls",
      );
    }
    this.#toolCalls.set(event.call.toolCallId, event);
    this.#actionOwners.set(event.call.actionId, event.call.toolCallId);
  }

  #acceptUsage(event: Extract<ModelStreamEvent, { type: "usage" }>): void {
    if (this.#usage !== undefined) {
      const regressed = event.inputTokens < this.#usage.inputTokens
        || event.outputTokens < this.#usage.outputTokens;
      throw protocol(
        regressed ? "model_stream.usage_regressed" : "model_stream.usage_duplicate",
        regressed
          ? "ModelProvider stream usage counters regressed"
          : "ModelProvider stream emitted usage more than once",
      );
    }
    this.#usage = event;
  }
}

export function validateModelStreamScript(events: readonly unknown[]): readonly ModelStreamEvent[] {
  const validator = new ModelStreamSequenceValidator();
  const parsed = events.map((event) => validator.accept(event));
  validator.finish();
  return Object.freeze(parsed);
}

export async function* validateModelStream(
  stream: AsyncIterable<unknown>,
  signal: AbortSignal,
): AsyncIterable<ModelStreamEvent> {
  const validator = new ModelStreamSequenceValidator();
  let terminal: Extract<ModelStreamEvent, { type: "completed" | "failed" }> | undefined;
  for await (const candidate of stream) {
    if (signal.aborted) return;
    const event = validator.accept(candidate);
    if (event.type === "completed" || event.type === "failed") terminal = event;
    else yield event;
  }
  if (signal.aborted) return;
  validator.finish();
  yield terminal!;
}

function protocol(
  code: ModelStreamProtocolErrorCode,
  message: string,
): ModelStreamProtocolError {
  return new ModelStreamProtocolError(code, message);
}
