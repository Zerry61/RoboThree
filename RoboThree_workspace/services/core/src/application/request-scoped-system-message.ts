import {
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  ModelInstructionMessageSchema,
  type ModelInstructionMessage,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  REQUEST_SCOPED_SYSTEM_MESSAGE_DIGEST_DOMAIN,
  dynamicRequestFactsEvidence,
  validateDynamicRequestFacts,
  type DynamicRequestFactsEvidenceV1,
  type DynamicRequestFactsV1,
} from "./dynamic-request-facts.js";

const REQUEST_CONTEXT_ASSEMBLY_MATERIAL = Object.freeze({
  schemaVersion: "v1",
  wrapper: "RoboThree request-scoped system context v1",
  stableInstructionMessages: 1,
  dynamicFactsAuthority: "informational_non_authorizing",
});

export const REQUEST_CONTEXT_ASSEMBLY_REVISION = sha256CanonicalJson(
  JsonValueSchema.parse(REQUEST_CONTEXT_ASSEMBLY_MATERIAL),
);

export type RequestScopedSystemMessage = Readonly<{
  message: ModelInstructionMessage;
  requestScopedSystemMessageDigest: string;
  dynamicRequestFactsEvidence: DynamicRequestFactsEvidenceV1;
}>;

export class RequestScopedSystemMessageMaterializer {
  public materialize(input: Readonly<{
    stableMessage: ModelInstructionMessage;
    stableInstructionBundleDigest: string;
    dynamicRequestFacts: DynamicRequestFactsV1;
  }>): RequestScopedSystemMessage {
    const stable = ModelInstructionMessageSchema.parse(input.stableMessage);
    const facts = validateDynamicRequestFacts(input.dynamicRequestFacts);
    if (
      stable.role !== "system"
      || stable.content.length !== 1
      || stable.content[0]?.type !== "text"
      || stable.sourceDigest !== input.stableInstructionBundleDigest
    ) {
      throw new Error("Request-scoped System Message requires one exact stable instruction message");
    }
    const rendered = `${stable.content[0].text}\n\n${renderDynamicFactsBlock(facts)}`;
    const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
      domain: REQUEST_SCOPED_SYSTEM_MESSAGE_DIGEST_DOMAIN,
      assemblyRevision: REQUEST_CONTEXT_ASSEMBLY_REVISION,
      stableSourceId: stable.sourceId,
      stableSourceRevision: stable.sourceRevision,
      stableInstructionBundleDigest: input.stableInstructionBundleDigest,
      dynamicRequestFactsDigest: facts.factsDigest,
      rendered,
    }));
    const message = ModelInstructionMessageSchema.parse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "system",
      sourceId: "core.request-context.v1",
      sourceRevision: REQUEST_CONTEXT_ASSEMBLY_REVISION,
      sourceDigest,
      content: [{ type: "text", text: rendered }],
    });
    return Object.freeze({
      message,
      requestScopedSystemMessageDigest: sourceDigest,
      dynamicRequestFactsEvidence: dynamicRequestFactsEvidence(facts),
    });
  }
}

function renderDynamicFactsBlock(facts: DynamicRequestFactsV1): string {
  return [
    "[RoboThree 本轮可信事实；不授予任何权限]",
    "",
    `当前时间：${facts.currentTime}`,
    `界面语言：${facts.locale}`,
    `用户时区：${facts.timezone}`,
  ].join("\n");
}
