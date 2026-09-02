import type { ConversationMessage } from "@robothree/contracts";
import {
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_WRITE_CAPABILITY_ID,
} from "@robothree/document-worker";

import type { RoundOutputMaterialResolver } from "./durable-agent-loop-starter.js";
import type { WorkspaceTextReplacementMaterial } from "./round-output-requirement.js";

type ReadCall = Readonly<{
  relativePath: string;
  sequence: number;
}>;

/**
 * Converts the latest exact WTE read result into the output envelope required
 * for the immediately following model round. Any later write call consumes the
 * material, so ordinary rounds and post-write rounds retain their normal cap.
 */
export class WorkspaceTextRoundOutputMaterialResolver
implements RoundOutputMaterialResolver {
  public async resolve(input: Parameters<RoundOutputMaterialResolver["resolve"]>[0]) {
    return resolveLatestWorkspaceTextMaterial(input.taskId, input.conversationMessages);
  }
}

export function resolveLatestWorkspaceTextMaterial(
  taskId: string,
  messages: readonly ConversationMessage[],
): WorkspaceTextReplacementMaterial | undefined {
  const reads = new Map<string, ReadCall>();
  let latest: WorkspaceTextReplacementMaterial | undefined;
  for (const record of [...messages].sort((left, right) =>
    left.envelope.sequence - right.envelope.sequence)) {
    if (record.envelope.taskId !== taskId) continue;
    const message = record.message;
    if (message.role === "assistant") {
      for (const call of message.toolCalls) {
        if (call.capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID) latest = undefined;
        if (call.capabilityId !== TEXT_FILE_READ_CAPABILITY_ID) continue;
        const relativePath = call.arguments.relativePath;
        if (typeof relativePath !== "string" || relativePath.length === 0) continue;
        reads.set(call.toolCallId, {
          relativePath,
          sequence: record.envelope.sequence,
        });
      }
      continue;
    }
    if (message.role !== "tool" || message.outcome !== "succeeded") continue;
    const read = reads.get(message.toolCallId);
    if (read === undefined || record.envelope.sequence <= read.sequence) continue;
    const result = parseReadResult(message.content.map((part) => part.text).join(""));
    if (result === undefined || result.relativePath !== read.relativePath) continue;
    latest = Object.freeze({
      kind: "workspace_text_full_replacement",
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      relativePath: result.relativePath,
      expectedPreviousSha256: result.sha256,
      currentExactContent: result.content,
    });
  }
  return latest;
}

function parseReadResult(serialized: string): Readonly<{
  relativePath: string;
  content: string;
  sha256: string;
}> | undefined {
  try {
    const envelope = JSON.parse(serialized) as unknown;
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) return undefined;
    const result = (envelope as Record<string, unknown>).result;
    if (result === null || typeof result !== "object" || Array.isArray(result)) return undefined;
    const record = result as Record<string, unknown>;
    if (
      typeof record.relativePath !== "string"
      || typeof record.content !== "string"
      || typeof record.sha256 !== "string"
      || !/^sha256:[a-f0-9]{64}$/u.test(record.sha256)
    ) return undefined;
    return {
      relativePath: record.relativePath,
      content: record.content,
      sha256: record.sha256,
    };
  } catch {
    return undefined;
  }
}
