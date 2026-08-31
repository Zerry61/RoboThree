import type {
  PersonalCredentialBrokerErrorCode,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";

import type {
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialCoordinatorErrorCode,
} from "../../application/personal-model-credential-coordinator.js";
import type {
  PersonalModelCredentialRevealErrorCode,
  PersonalModelCredentialRevealService,
} from "../../application/personal-model-credential-reveal-service.js";
import type {
  PersonalCredentialBrokerHandler,
  PersonalCredentialBrokerHandlerResult,
} from "./personal-credential-broker-server.js";

export function createPersonalModelCredentialBrokerHandler(
  coordinator: PersonalModelCredentialCoordinator,
  revealService?: PersonalModelCredentialRevealService,
): PersonalCredentialBrokerHandler {
  return async (header, secret) => {
    if (header.commandType === "reveal") {
      if (revealService === undefined
        || header.expectedConfigurationRevision === undefined
        || header.expectedExecutionDefinitionDigest === undefined) {
        return rejected("credential_store_unavailable");
      }
      const result = await revealService.reveal({
        commandId: header.commandId,
        commandType: "reveal",
        personalModelId: header.personalModelId,
        expectedConfigurationRevision: header.expectedConfigurationRevision,
        expectedExecutionDefinitionDigest: header.expectedExecutionDefinitionDigest,
        requestDigest: header.commandRequestDigest,
        deadlineAt: header.deadlineAt,
      });
      return result.ok
        ? { status: "completed", secret: result.secret }
        : mapRevealFailure(result.error.code);
    }
    const result = await coordinator.executePrepared({
      commandId: header.commandId,
      commandType: header.commandType,
      personalModelId: header.personalModelId,
      ...(header.commandType === "create" || header.expectedConfigurationRevision === undefined
        ? {}
        : { expectedConfigurationRevision: header.expectedConfigurationRevision }),
      requestDigest: header.commandRequestDigest,
      deadlineAt: header.deadlineAt,
      secret,
    });
    if (result.ok) {
      return result.status === "committed" || result.status === "cleanup_pending"
        ? { status: "completed" }
        : rejected("credential_operation_uncertain", "uncertain");
    }
    return mapFailure(result.error.code);
  };
}

function mapRevealFailure(
  code: PersonalModelCredentialRevealErrorCode,
): PersonalCredentialBrokerHandlerResult {
  switch (code) {
    case "personal_model.reveal_replay_forbidden":
      return rejected("credential_reveal_replay_forbidden");
    case "personal_model.reveal_rate_limited":
    case "personal_model.reveal_busy":
      return rejected("credential_transport_busy");
    case "personal_model.permission_denied":
      return rejected("credential_store_access_denied");
    case "personal_model.not_found":
      return rejected("credential_store_not_found");
    case "personal_model.conflict":
      return rejected("credential_transport_conflict");
    case "personal_model.deadline_exceeded":
      return rejected("credential_transport_unavailable", "timed_out");
    case "personal_model.cancelled":
      return rejected("credential_store_cancelled", "cancelled");
    case "personal_model.credential_operation_uncertain":
      return rejected("credential_operation_uncertain", "uncertain");
    case "personal_model.reveal_unavailable":
    case "personal_model.credential_unavailable":
      return rejected("credential_store_unavailable");
  }
}

function mapFailure(
  code: PersonalModelCredentialCoordinatorErrorCode,
): PersonalCredentialBrokerHandlerResult {
  switch (code) {
    case "personal_model.not_prepared":
      return rejected("credential_transport_invalid_request");
    case "personal_model.permission_denied":
      return rejected("credential_store_access_denied");
    case "personal_model.conflict":
    case "personal_model.not_found":
    case "personal_model.invalid_transition":
    case "personal_model.in_use_or_usage_unknown":
      return rejected("credential_transport_conflict");
    case "personal_model.manual_attention_required":
    case "personal_model.credential_operation_uncertain":
      return rejected("credential_operation_uncertain", "uncertain");
    case "personal_model.credential_unavailable":
      return rejected("credential_store_unavailable");
    case "personal_model.deadline_exceeded":
      return rejected("credential_transport_unavailable", "timed_out");
    case "personal_model.cancelled":
      return rejected("credential_store_cancelled", "cancelled");
  }
}

function rejected(
  typedErrorCode: PersonalCredentialBrokerErrorCode,
  status: "rejected" | "cancelled" | "timed_out" | "uncertain" = "rejected",
): PersonalCredentialBrokerHandlerResult {
  return { status, typedErrorCode };
}
