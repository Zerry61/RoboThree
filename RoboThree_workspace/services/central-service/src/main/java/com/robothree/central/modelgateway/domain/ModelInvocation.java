package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelInvocation(
        UUID invocationId,
        String enterpriseId,
        String userId,
        String deviceId,
        String clientInstanceId,
        UUID clientRequestId,
        UUID requestId,
        String requestDigest,
        String modelId,
        String modelRevision,
        String configurationRevision,
        String runtimeRegistryGeneration,
        String admissionType,
        String admissionDigest,
        Instant providerRequestDeadlineAt,
        long providerStreamIdleTimeoutMillis,
        ModelInvocationStatus status,
        long statusRevision,
        long lastDurableEventSequence,
        String durableEventStreamDigest,
        String dispatchDecision,
        Instant cancelRequestedAt,
        String cancelReason,
        Instant timeoutIntentAt,
        String usageJson,
        String finishReason,
        String safeErrorCode,
        String safeSummary,
        Instant createdAt,
        Instant startedAt,
        Instant endedAt,
        Instant updatedAt) {

    public ModelInvocation {
        Objects.requireNonNull(invocationId, "invocationId");
        enterpriseId = text(enterpriseId, "enterpriseId");
        userId = text(userId, "userId");
        deviceId = text(deviceId, "deviceId");
        clientInstanceId = text(clientInstanceId, "clientInstanceId");
        Objects.requireNonNull(clientRequestId, "clientRequestId");
        Objects.requireNonNull(requestId, "requestId");
        requestDigest = digest(requestDigest, "requestDigest");
        modelId = text(modelId, "modelId");
        modelRevision = digest(modelRevision, "modelRevision");
        configurationRevision = digest(configurationRevision, "configurationRevision");
        runtimeRegistryGeneration =
                digest(runtimeRegistryGeneration, "runtimeRegistryGeneration");
        admissionType = text(admissionType, "admissionType");
        admissionDigest = digest(admissionDigest, "admissionDigest");
        Objects.requireNonNull(providerRequestDeadlineAt, "providerRequestDeadlineAt");
        if (providerStreamIdleTimeoutMillis < 1_000
                || providerStreamIdleTimeoutMillis > 300_000) {
            throw new IllegalArgumentException(
                    "providerStreamIdleTimeoutMillis is outside the contract range");
        }
        Objects.requireNonNull(status, "status");
        statusRevision = revision(statusRevision, "statusRevision");
        lastDurableEventSequence =
                revision(lastDurableEventSequence, "lastDurableEventSequence");
        if (durableEventStreamDigest != null) {
            durableEventStreamDigest =
                    digest(durableEventStreamDigest, "durableEventStreamDigest");
        }
        dispatchDecision = optionalText(dispatchDecision, "dispatchDecision");
        cancelReason = optionalText(cancelReason, "cancelReason");
        usageJson = optionalText(usageJson, "usageJson");
        finishReason = optionalText(finishReason, "finishReason");
        safeErrorCode = optionalText(safeErrorCode, "safeErrorCode");
        safeSummary = optionalText(safeSummary, "safeSummary");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (providerRequestDeadlineAt.isBefore(createdAt)) {
            throw new IllegalArgumentException(
                    "providerRequestDeadlineAt must not be before createdAt");
        }
        if (status == ModelInvocationStatus.ACCEPTED && statusRevision != 0) {
            throw new IllegalArgumentException("accepted invocation must start at revision 0");
        }
        if (lastDurableEventSequence > 0 && durableEventStreamDigest == null) {
            throw new IllegalArgumentException(
                    "durable event sequence requires a stream digest");
        }
        if ((cancelRequestedAt == null) != (cancelReason == null)) {
            throw new IllegalArgumentException(
                    "cancel intent timestamp and reason must be present together");
        }
        if (startedAt != null && startedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("startedAt must not be before createdAt");
        }
        if (endedAt != null && endedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("endedAt must not be before createdAt");
        }
    }

    public ClientRequestScope clientRequestScope() {
        return new ClientRequestScope(
                enterpriseId,
                userId,
                deviceId,
                clientInstanceId,
                clientRequestId);
    }

    private static String optionalText(String value, String name) {
        return value == null ? null : text(value, name);
    }

    public record ClientRequestScope(
            String enterpriseId,
            String userId,
            String deviceId,
            String clientInstanceId,
            UUID clientRequestId) {

        public ClientRequestScope {
            enterpriseId = text(enterpriseId, "enterpriseId");
            userId = text(userId, "userId");
            deviceId = text(deviceId, "deviceId");
            clientInstanceId = text(clientInstanceId, "clientInstanceId");
            Objects.requireNonNull(clientRequestId, "clientRequestId");
        }
    }
}
