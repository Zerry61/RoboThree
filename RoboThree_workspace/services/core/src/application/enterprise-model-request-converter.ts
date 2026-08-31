import {
  JsonObjectSchema,
  JsonValueSchema,
  type JsonObject,
} from "@robothree/contracts";
import { parseReadableModelRequest } from "./model-request-revisions.js";
import {
  EnterpriseReasoningSafeSidecarSchema,
  type EnterpriseReasoningSafeSidecar,
} from "./enterprise-reasoning-mapping.js";

import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import type { ModelInvocationCacheContext } from "../ports/session-scope-digest-provider.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export type EnterpriseModelAcceptMaterial = Readonly<{
  document: JsonObject;
  requestDigest: string;
  gatewayContractVersion: "v1alpha1" | "v1alpha2" | "v1alpha3";
}>;

export class EnterpriseModelRequestConverter {
  public convert(input: Readonly<{
    invocation: ModelProviderInvocation;
    clientRequestId: string;
    transportRequestId: string;
    providerStreamIdleTimeoutMillis: number;
    cacheContext?: ModelInvocationCacheContext;
    reasoning?: EnterpriseReasoningSafeSidecar;
  }>): EnterpriseModelAcceptMaterial {
    const request = parseReadableModelRequest(input.invocation.modelRequest);
    if ((request.schemaVersion === "v1alpha2") !== (input.reasoning !== undefined)) {
      throw new Error("Enterprise reasoning sidecar must match ModelRequest version");
    }
    const selection = input.invocation.runtimeSelection;
    const configurationRevision = selection.enterpriseConfigRevision;
    if (configurationRevision === undefined) {
      throw new Error("Enterprise Model invocation requires an exact configuration revision");
    }
    const modelRequest = JsonObjectSchema.parse({
      snapshotId: request.snapshotId,
      contextSourceDigest: hexDigest(request.contextSourceDigest),
      model: {
        modelId: request.model.capabilityId,
        modelRevision: hexDigest(request.model.capabilityRevision),
        configurationRevision: hexDigest(configurationRevision),
        runtimeRegistryGeneration: hexDigest(selection.registryRevision),
      },
      messages: request.messages.map((message) => {
        switch (message.role) {
          case "system":
            return {
              role: "system",
              sourceId: message.sourceId,
              sourceRevision: message.sourceRevision,
              sourceDigest: hexDigest(message.sourceDigest),
              content: message.content,
            };
          case "user":
            return { role: "user", content: message.content };
          case "assistant":
            return {
              role: "assistant",
              content: message.content,
              toolCalls: message.toolCalls.map((call) => ({
                toolCallId: call.toolCallId,
                name: projectEnterpriseProviderToolName(call.capabilityId),
                arguments: call.arguments,
                argumentsDigest: hexDigest(sha256CanonicalJson(call.arguments)),
              })),
            };
          case "tool":
            return {
              role: "tool",
              toolCallId: message.toolCallId,
              outcome: message.outcome,
              resultDigest: hexDigest(message.resultDigest),
              content: message.content,
            };
        }
      }),
      tools: request.tools.map((tool) => ({
        capabilityId: tool.capabilityId,
        capabilityRevision: hexDigest(tool.capabilityRevision),
        name: projectEnterpriseProviderToolName(tool.capabilityId),
        description: tool.description,
        inputSchema: tool.inputSchema,
        inputSchemaDigest: hexDigest(sha256CanonicalJson(tool.inputSchema)),
      })),
      maxOutputTokens: request.maxOutputTokens,
      ...(input.reasoning === undefined
        ? {}
        : { reasoning: projectGatewayReasoning(input.reasoning) }),
    });
    const admission = JsonObjectSchema.parse({
      type: "user_confirmed",
      taskId: input.invocation.taskId,
      confirmationId: input.invocation.admission.confirmationId,
      externalTarget: input.invocation.externalTarget,
      dataCategories: input.invocation.dataCategories,
      dataScopeDigest: hexDigest(input.invocation.dataScopeDigest),
      confirmationDigest: hexDigest(input.invocation.admission.confirmationDigest),
    });
    const timeoutPolicy = JsonObjectSchema.parse({
      providerRequestDeadlineAt: input.invocation.deadlineAt,
      providerStreamIdleTimeoutMillis: input.providerStreamIdleTimeoutMillis,
    });
    const cacheContext = input.cacheContext === undefined
      ? undefined
      : JsonObjectSchema.parse({
        sessionScopeDigest: hexDigest(input.cacheContext.sessionScopeDigest),
      });
    if (input.cacheContext !== undefined) {
      const actualCacheContextDigest = sha256CanonicalJson(JsonValueSchema.parse(cacheContext));
      if (actualCacheContextDigest !== input.cacheContext.cacheContextDigest) {
        throw new Error("Prompt Cache context digest does not match the exact sidecar");
      }
    }
    const v3 = request.schemaVersion === "v1alpha2";
    const requestDigest = hexDigest(sha256CanonicalJson(JsonValueSchema.parse({
      modelRequest,
      admission,
      timeoutPolicy,
      ...(v3 && input.cacheContext !== undefined
        ? { cacheContextDigest: hexDigest(input.cacheContext.cacheContextDigest) }
        : {}),
    })));
    const gatewayContractVersion = v3
      ? "v1alpha3" as const
      : input.cacheContext?.gatewayContractVersion ?? "v1alpha1";
    return Object.freeze({
      requestDigest,
      gatewayContractVersion,
      document: JsonObjectSchema.parse({
        contractVersion: gatewayContractVersion,
        clientRequestId: input.clientRequestId,
        requestId: input.transportRequestId,
        requestDigest,
        audience: "enterprise-model-gateway",
        requiredPermission: "model.use",
        modelRequest,
        admission,
        timeoutPolicy,
        ...(cacheContext === undefined ? {} : {
          cacheContext,
          cacheContextDigest: hexDigest(input.cacheContext!.cacheContextDigest),
        }),
      }),
    });
  }
}

function projectGatewayReasoning(
  value: EnterpriseReasoningSafeSidecar,
): JsonObject {
  const reasoning = EnterpriseReasoningSafeSidecarSchema.parse(value);
  if (reasoning.mode === "default_passthrough") {
    return JsonObjectSchema.parse({
      mode: reasoning.mode,
      reasoningModeLockId: reasoning.reasoningModeLockId,
      reasoningModeLockDigest: hexDigest(reasoning.reasoningModeLockDigest),
    });
  }
  return JsonObjectSchema.parse({
    mode: reasoning.mode,
    reasoningModeLockId: reasoning.reasoningModeLockId,
    reasoningModeLockDigest: hexDigest(reasoning.reasoningModeLockDigest),
    profileId: reasoning.profileId,
    profileRevision: hexDigest(reasoning.profileRevision),
    profileDigest: hexDigest(reasoning.profileDigest),
    strategyId: reasoning.strategyId,
    strategyRevision: hexDigest(reasoning.strategyRevision),
    strategyDigest: hexDigest(reasoning.strategyDigest),
    mappingRevision: hexDigest(reasoning.mappingRevision),
    mappingDigest: hexDigest(reasoning.mappingDigest),
    timeoutPolicyRef: reasoning.timeoutPolicyRef,
  });
}

function hexDigest(value: string): string {
  if (!value.startsWith("sha256:") || value.length !== 71) {
    throw new Error("Expected a prefixed SHA-256 digest");
  }
  return value.slice("sha256:".length);
}

export function projectEnterpriseProviderToolName(capabilityId: string): string {
  const readable = capabilityId.replace(/[^A-Za-z0-9_-]/gu, "_");
  const digestSuffix = sha256CanonicalJson(capabilityId).slice("sha256:".length, 19);
  return `${readable.slice(0, 44)}_${digestSuffix}`;
}
