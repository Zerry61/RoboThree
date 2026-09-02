import type { ConversationMessage } from "@robothree/contracts";

export const WORKSPACE_TEXT_READ_CAPABILITY_ID =
  "tool.workspace.file.read_text";

export type ContextMaterialClass =
  | "protected_exact"
  | "compressible_history"
  | "referenceable_preview";

export type ToolResultMaterialDecision = Readonly<{
  materialClass: ContextMaterialClass;
  capabilityId?: string;
}>;

export class ContextMaterialIdentityError extends Error {
  public readonly code = "context.tool_material_identity_invalid";

  public constructor(message: string) {
    super(message);
    this.name = "ContextMaterialIdentityError";
  }
}

/**
 * Content policy is driven by the exact Tool identity captured in the durable
 * Assistant Tool Call, never by field names or by guessing from result text.
 */
export class ContextMaterialPolicy {
  public classifyToolResults(
    records: readonly ConversationMessage[],
  ): ReadonlyMap<string, ToolResultMaterialDecision> {
    const authorityByCall = new Map<string, Readonly<{
      capabilityId: string;
      taskId: string;
      actionId: string;
    }>>();
    for (const record of records) {
      if (record.message.role !== "assistant") continue;
      for (const call of record.message.toolCalls) {
        if (authorityByCall.has(call.toolCallId)) {
          throw new ContextMaterialIdentityError("Tool Call identity is duplicated");
        }
        authorityByCall.set(call.toolCallId, Object.freeze({
          capabilityId: call.capabilityId,
          taskId: call.taskId,
          actionId: call.actionId,
        }));
      }
    }
    const currentUserSequence = [...records].reverse().find(
      (record) => record.message.role === "user",
    )?.envelope.sequence;
    const seenToolResults = new Set<string>();
    const decisions = new Map<string, ToolResultMaterialDecision>();
    for (const record of records) {
      if (record.message.role !== "tool") continue;
      if (seenToolResults.has(record.message.toolCallId)) {
        throw new ContextMaterialIdentityError("Tool Result identity is duplicated");
      }
      seenToolResults.add(record.message.toolCallId);
      const authority = authorityByCall.get(record.message.toolCallId);
      if (
        authority === undefined
        || authority.taskId !== record.message.taskId
        || authority.actionId !== record.message.actionId
      ) {
        throw new ContextMaterialIdentityError(
          "Tool Result does not match its durable Assistant Tool Call",
        );
      }
      decisions.set(record.message.toolCallId, Object.freeze({
        materialClass: authority.capabilityId === WORKSPACE_TEXT_READ_CAPABILITY_ID
          && currentUserSequence !== undefined
          && record.envelope.sequence > currentUserSequence
          ? "protected_exact" as const
          : "referenceable_preview" as const,
        capabilityId: authority.capabilityId,
      }));
    }
    return decisions;
  }
}
