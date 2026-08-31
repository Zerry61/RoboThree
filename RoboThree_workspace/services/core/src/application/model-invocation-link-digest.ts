import { JsonValueSchema } from "@robothree/contracts";
import type { ModelInvocationLink } from "../ports/model-invocation-link-persistence.js";
import type { PrepareModelInvocationLinkInput } from "../ports/model-invocation-link-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export function calculateModelInvocationLinkDigest(
  record: Omit<ModelInvocationLink, "recordDigest">,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(
    JSON.parse(JSON.stringify(record)) as unknown,
  ));
}

export function samePreparedModelInvocationLink(
  record: ModelInvocationLink,
  input: PrepareModelInvocationLinkInput,
): boolean {
  const common = record.taskId === input.taskId
    && record.runId === input.runId
    && record.stepId === input.stepId
    && record.actionId === input.actionId
    && record.round === input.round
    && record.runtimeSelectionDigest === input.runtimeSelectionDigest
    && record.assistantMessageId === input.assistantMessageId
    && record.modelRequestId === input.modelRequestId
    && record.modelRequestDigest === input.modelRequestDigest
    && record.confirmationId === input.confirmationId
    && record.scopeDigest === input.scopeDigest
    && record.dataScopeDigest === input.dataScopeDigest
    && record.clientRequestId === input.clientRequestId
    && record.centralAcceptRequestDigest === input.centralAcceptRequestDigest
    && record.createdAt === input.createdAt;
  if (!common) return false;
  const recordV2 = "schemaVersion" in record;
  const inputV2 = "schemaVersion" in input;
  if (recordV2 !== inputV2) return false;
  if (record.providerRequestDeadlineAt !== input.providerRequestDeadlineAt) return false;
  if (!recordV2 || !inputV2) return true;
  return record.schemaVersion === input.schemaVersion
    && record.contextAssemblyReceiptDigest === input.contextAssemblyReceiptDigest
    && record.dynamicRequestFacts.factsDigest === input.dynamicRequestFacts.factsDigest
    && sha256CanonicalJson(JsonValueSchema.parse(record.dynamicRequestFacts))
      === sha256CanonicalJson(JsonValueSchema.parse(input.dynamicRequestFacts));
}
