import type { JsonObject } from "@robothree/contracts";

import type { EnterpriseIdentityScope } from "./enterprise-access-token-provider.js";

export type EnterpriseModelAccepted = Readonly<{
  invocationId: string;
  clientRequestId: string;
  requestDigest: string;
  statusRevision: number;
  lastDurableEventSequence: number;
  durableCursor: string;
  createdAt: string;
}>;

export type EnterpriseModelStatus = Readonly<{
  invocationId: string;
  clientRequestId: string;
  requestDigest: string;
  status: "accepted" | "running" | "completed" | "failed" | "cancelled" | "timed_out" | "uncertain";
  statusRevision: number;
  lastDurableEventSequence: number;
  durableCursor: string;
  finishReason?: string;
  safeErrorCode?: string;
  safeSummary?: string;
}>;

export type EnterpriseModelEvent =
  | Readonly<{
    eventClass: "ephemeral";
    invocationId: string;
    eventId: string;
    streamSequence: number;
    eventType: "started";
    occurredAt: string;
  }>
  | Readonly<{
    eventClass: "ephemeral";
    invocationId: string;
    eventId: string;
    streamSequence: number;
    eventType: "text_delta";
    delta: string;
    occurredAt: string;
  }>
  | Readonly<{
    eventClass: "ephemeral";
    invocationId: string;
    eventId: string;
    streamSequence: number;
    eventType: "tool_call";
    call: Readonly<{
      toolCallId: string;
      name: string;
      arguments: JsonObject;
      argumentsDigest: string;
    }>;
    occurredAt: string;
  }>
  | Readonly<{
    eventClass: "durable";
    invocationId: string;
    eventId: string;
    durableSequence: number;
    durableCursor: string;
    eventType: "accepted" | "dispatch_decided" | "completed" | "failed" | "cancelled" | "timed_out" | "uncertain" | "usage_recorded";
    eventDigest: string;
    statusRevision?: number;
    status?: EnterpriseModelStatus["status"];
    inputTokens?: number;
    outputTokens?: number;
    occurredAt: string;
  }>;

export interface EnterpriseModelGatewayOperation {
  readonly scope: EnterpriseIdentityScope;
  accept(document: JsonObject, signal: AbortSignal): Promise<EnterpriseModelAccepted>;
  status(invocationId: string, signal: AbortSignal): Promise<EnterpriseModelStatus>;
  cancel(input: Readonly<{
    invocationId: string;
    requestId: string;
    expectedStatusRevision: number;
    reason: "user_requested" | "task_cancelled" | "deadline_exceeded";
    signal: AbortSignal;
  }>): Promise<EnterpriseModelStatus>;
  events(input: Readonly<{
    invocationId: string;
    durableCursor?: string;
    signal: AbortSignal;
  }>): AsyncIterable<EnterpriseModelEvent>;
}

export interface EnterpriseModelGatewayClient {
  begin(
    scope: EnterpriseIdentityScope,
    contractVersion?: "v1alpha1" | "v1alpha2" | "v1alpha3",
  ): EnterpriseModelGatewayOperation;
}
