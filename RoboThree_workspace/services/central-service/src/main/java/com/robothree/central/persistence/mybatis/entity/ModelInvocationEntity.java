package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelInvocationEntity {

    private UUID invocationId;
    private String enterpriseId;
    private String userId;
    private String deviceId;
    private String clientInstanceId;
    private UUID clientRequestId;
    private UUID requestId;
    private String requestDigest;
    private String modelId;
    private String modelRevision;
    private String configurationRevision;
    private String runtimeRegistryGeneration;
    private String admissionType;
    private String admissionDigest;
    private OffsetDateTime providerRequestDeadlineAt;
    private long providerStreamIdleTimeoutMillis;
    private String status;
    private long statusRevision;
    private long lastDurableEventSequence;
    private String durableEventStreamDigest;
    private String dispatchDecision;
    private OffsetDateTime cancelRequestedAt;
    private String cancelReason;
    private OffsetDateTime timeoutIntentAt;
    private String usageJson;
    private String finishReason;
    private String safeErrorCode;
    private String safeSummary;
    private OffsetDateTime createdAt;
    private OffsetDateTime startedAt;
    private OffsetDateTime endedAt;
    private OffsetDateTime updatedAt;

    public ModelInvocationEntity() {}

    public ModelInvocationEntity(
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
            OffsetDateTime providerRequestDeadlineAt,
            long providerStreamIdleTimeoutMillis,
            String status,
            long statusRevision,
            long lastDurableEventSequence,
            String durableEventStreamDigest,
            String dispatchDecision,
            OffsetDateTime cancelRequestedAt,
            String cancelReason,
            OffsetDateTime timeoutIntentAt,
            String usageJson,
            String finishReason,
            String safeErrorCode,
            String safeSummary,
            OffsetDateTime createdAt,
            OffsetDateTime startedAt,
            OffsetDateTime endedAt,
            OffsetDateTime updatedAt) {
        this.invocationId = invocationId;
        this.enterpriseId = enterpriseId;
        this.userId = userId;
        this.deviceId = deviceId;
        this.clientInstanceId = clientInstanceId;
        this.clientRequestId = clientRequestId;
        this.requestId = requestId;
        this.requestDigest = requestDigest;
        this.modelId = modelId;
        this.modelRevision = modelRevision;
        this.configurationRevision = configurationRevision;
        this.runtimeRegistryGeneration = runtimeRegistryGeneration;
        this.admissionType = admissionType;
        this.admissionDigest = admissionDigest;
        this.providerRequestDeadlineAt = providerRequestDeadlineAt;
        this.providerStreamIdleTimeoutMillis = providerStreamIdleTimeoutMillis;
        this.status = status;
        this.statusRevision = statusRevision;
        this.lastDurableEventSequence = lastDurableEventSequence;
        this.durableEventStreamDigest = durableEventStreamDigest;
        this.dispatchDecision = dispatchDecision;
        this.cancelRequestedAt = cancelRequestedAt;
        this.cancelReason = cancelReason;
        this.timeoutIntentAt = timeoutIntentAt;
        this.usageJson = usageJson;
        this.finishReason = finishReason;
        this.safeErrorCode = safeErrorCode;
        this.safeSummary = safeSummary;
        this.createdAt = createdAt;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.updatedAt = updatedAt;
    }
}
