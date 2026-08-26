package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.domain.ModelInvocationRecoveryLease;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.UsageAuthority;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationAuditOutboxEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationEventEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationRecoveryLeaseEntity;
import com.robothree.central.persistence.mybatis.entity.ModelProviderAttemptEntity;
import com.robothree.central.persistence.mybatis.entity.ProviderUsageFactEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationCacheContextEntity;
import com.robothree.central.persistence.mybatis.entity.PromptCachePlanEntity;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

final class ModelInvocationEntityConverter {

    private ModelInvocationEntityConverter() {}

    static ModelInvocationEntity toEntity(ModelInvocation value) {
        return new ModelInvocationEntity(
                value.invocationId(),
                value.enterpriseId(),
                value.userId(),
                value.deviceId(),
                value.clientInstanceId(),
                value.clientRequestId(),
                value.requestId(),
                value.requestDigest(),
                value.modelId(),
                value.modelRevision(),
                value.configurationRevision(),
                value.runtimeRegistryGeneration(),
                value.admissionType(),
                value.admissionDigest(),
                at(value.providerRequestDeadlineAt()),
                value.providerStreamIdleTimeoutMillis(),
                value.status().contractValue(),
                value.statusRevision(),
                value.lastDurableEventSequence(),
                value.durableEventStreamDigest(),
                value.dispatchDecision(),
                atNullable(value.cancelRequestedAt()),
                value.cancelReason(),
                atNullable(value.timeoutIntentAt()),
                value.usageJson(),
                value.finishReason(),
                value.safeErrorCode(),
                value.safeSummary(),
                at(value.createdAt()),
                atNullable(value.startedAt()),
                atNullable(value.endedAt()),
                at(value.updatedAt()));
    }

    static ModelInvocation toDomain(ModelInvocationEntity value) {
        return new ModelInvocation(
                value.getInvocationId(),
                value.getEnterpriseId(),
                value.getUserId(),
                value.getDeviceId(),
                value.getClientInstanceId(),
                value.getClientRequestId(),
                value.getRequestId(),
                value.getRequestDigest(),
                value.getModelId(),
                value.getModelRevision(),
                value.getConfigurationRevision(),
                value.getRuntimeRegistryGeneration(),
                value.getAdmissionType(),
                value.getAdmissionDigest(),
                value.getProviderRequestDeadlineAt().toInstant(),
                value.getProviderStreamIdleTimeoutMillis(),
                ModelInvocationStatus.fromContractValue(value.getStatus()),
                value.getStatusRevision(),
                value.getLastDurableEventSequence(),
                value.getDurableEventStreamDigest(),
                value.getDispatchDecision(),
                instant(value.getCancelRequestedAt()),
                value.getCancelReason(),
                instant(value.getTimeoutIntentAt()),
                value.getUsageJson(),
                value.getFinishReason(),
                value.getSafeErrorCode(),
                value.getSafeSummary(),
                value.getCreatedAt().toInstant(),
                instant(value.getStartedAt()),
                instant(value.getEndedAt()),
                value.getUpdatedAt().toInstant());
    }

    static ModelInvocationEventEntity toEntity(ModelInvocationDurableEvent value) {
        return new ModelInvocationEventEntity(
                value.invocationId(),
                value.eventSequence(),
                value.eventId(),
                value.eventType(),
                value.status() == null ? null : value.status().contractValue(),
                value.statusRevision(),
                value.eventDigest(),
                value.streamDigest(),
                value.metadataJson(),
                at(value.createdAt()));
    }

    static ModelInvocationDurableEvent toDomain(ModelInvocationEventEntity value) {
        return new ModelInvocationDurableEvent(
                value.getInvocationId(),
                value.getEventSequence(),
                value.getEventId(),
                value.getEventType(),
                value.getStatus() == null
                        ? null
                        : ModelInvocationStatus.fromContractValue(value.getStatus()),
                value.getStatusRevision(),
                value.getEventDigest(),
                value.getStreamDigest(),
                value.getMetadataJson(),
                value.getCreatedAt().toInstant());
    }

    static ModelInvocationRecoveryLeaseEntity toEntity(ModelInvocationRecoveryLease value) {
        return new ModelInvocationRecoveryLeaseEntity(
                value.invocationId(),
                value.ownerNodeId(),
                value.fencingEpoch(),
                value.statusRevision(),
                at(value.leaseExpiresAt()),
                at(value.databaseObservedAt()),
                value.recoveryAttempt(),
                value.policyRevision(),
                at(value.updatedAt()));
    }

    static ModelInvocationRecoveryLease toDomain(ModelInvocationRecoveryLeaseEntity value) {
        return new ModelInvocationRecoveryLease(
                value.getInvocationId(),
                value.getOwnerNodeId(),
                value.getFencingEpoch(),
                value.getStatusRevision(),
                value.getLeaseExpiresAt().toInstant(),
                value.getDatabaseObservedAt().toInstant(),
                value.getRecoveryAttempt(),
                value.getPolicyRevision(),
                value.getUpdatedAt().toInstant());
    }

    static ModelInvocationAuditOutboxEntity toEntity(ModelInvocationAuditOutbox value) {
        return new ModelInvocationAuditOutboxEntity(
                value.outboxId(),
                value.invocationId(),
                value.eventId(),
                value.eventType(),
                value.eventDigest(),
                at(value.createdAt()),
                atNullable(value.publishedAt()),
                value.attemptCount());
    }

    static ModelInvocationAuditOutbox toDomain(ModelInvocationAuditOutboxEntity value) {
        return new ModelInvocationAuditOutbox(
                value.getOutboxId(),
                value.getInvocationId(),
                value.getEventId(),
                value.getEventType(),
                value.getEventDigest(),
                value.getCreatedAt().toInstant(),
                instant(value.getPublishedAt()),
                value.getAttemptCount());
    }

    static ModelProviderAttemptEntity toEntity(ModelProviderAttempt value) {
        return new ModelProviderAttemptEntity(
                value.usageAuthority().contractValue(),
                value.authorityInvocationId(),
                value.providerAttemptKey(),
                value.fencingEpoch(),
                at(value.registeredAt()));
    }

    static ModelProviderAttempt toDomain(ModelProviderAttemptEntity value) {
        return new ModelProviderAttempt(
                UsageAuthority.fromContractValue(value.getUsageAuthority()),
                value.getAuthorityInvocationId(),
                value.getProviderAttemptKey(),
                value.getFencingEpoch(),
                value.getRegisteredAt().toInstant());
    }

    static ProviderUsageFactEntity toEntity(ProviderUsageFact value) {
        return new ProviderUsageFactEntity(
                value.usageFactId(),
                value.usageAuthority().contractValue(),
                value.authorityInvocationId(),
                value.providerAttemptKey(),
                value.fencingEpoch(),
                value.usageDigest(),
                value.sourceProtocol(),
                value.reportingSemanticsRevision(),
                value.providerInputTokens(),
                value.providerOutputTokens(),
                value.cacheReadInputTokens(),
                value.cacheWriteInputTokens(),
                value.reasoningOutputTokens(),
                value.normalizedTotalInputTokens(),
                value.attemptDisposition().contractValue(),
                at(value.recordedAt()));
    }

    static ProviderUsageFact toDomain(ProviderUsageFactEntity value) {
        return new ProviderUsageFact(
                value.getUsageFactId(),
                UsageAuthority.fromContractValue(value.getUsageAuthority()),
                value.getAuthorityInvocationId(),
                value.getProviderAttemptKey(),
                value.getFencingEpoch(),
                value.getUsageDigest(),
                value.getSourceProtocol(),
                value.getReportingSemanticsRevision(),
                value.getProviderInputTokens(),
                value.getProviderOutputTokens(),
                value.getCacheReadInputTokens(),
                value.getCacheWriteInputTokens(),
                value.getReasoningOutputTokens(),
                value.getNormalizedTotalInputTokens(),
                ProviderUsageFact.AttemptDisposition.fromContractValue(
                        value.getAttemptDisposition()),
                value.getRecordedAt().toInstant());
    }

    static ModelInvocationCacheContextEntity toEntity(ModelInvocationCacheContext value) {
        return new ModelInvocationCacheContextEntity(
                value.invocationId(),
                value.cacheExecutionAuthority().contractValue(),
                value.gatewayContractVersion(),
                value.sessionScopeDigest(),
                value.cacheContextDigest(),
                value.contextRecordDigest(),
                at(value.createdAt()));
    }

    static ModelInvocationCacheContext toDomain(ModelInvocationCacheContextEntity value) {
        return new ModelInvocationCacheContext(
                value.getInvocationId(),
                UsageAuthority.fromContractValue(value.getCacheExecutionAuthority()),
                value.getGatewayContractVersion(),
                value.getSessionScopeDigest(),
                value.getCacheContextDigest(),
                value.getContextRecordDigest(),
                value.getCreatedAt().toInstant());
    }

    static PromptCachePlanEntity toEntity(PromptCachePlan value) {
        return new PromptCachePlanEntity(
                value.invocationId(),
                value.cacheContextDigest(),
                value.cacheScopeIdDigest(),
                value.staticSourceLockDigest(),
                value.staticPrefixDigest(),
                value.compatibilityFingerprintDigest(),
                value.cacheKeyDigest(),
                value.cachePolicyRevision(),
                value.bindingRevision(),
                value.bindingDigest(),
                value.profileId(),
                value.profileRevision(),
                value.profileDigest(),
                value.providerProjectionMode().contractValue(),
                value.eligible(),
                value.skipReason() == null ? null : value.skipReason().contractValue(),
                value.planDigest(),
                at(value.createdAt()));
    }

    static PromptCachePlan toDomain(PromptCachePlanEntity value) {
        return new PromptCachePlan(
                value.getInvocationId(),
                value.getCacheContextDigest(),
                value.getCacheScopeIdDigest(),
                value.getStaticSourceLockDigest(),
                value.getStaticPrefixDigest(),
                value.getCompatibilityFingerprintDigest(),
                value.getCacheKeyDigest(),
                value.getCachePolicyRevision(),
                value.getBindingRevision(),
                value.getBindingDigest(),
                value.getProfileId(),
                value.getProfileRevision(),
                value.getProfileDigest(),
                PromptCacheProfile.ProjectionMode.fromContractValue(
                        value.getProviderProjectionMode()),
                value.isEligible(),
                value.getSkipReason() == null
                        ? null
                        : PromptCachePlan.SkipReason.fromContractValue(value.getSkipReason()),
                value.getPlanDigest(),
                value.getCreatedAt().toInstant());
    }

    private static OffsetDateTime at(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }

    private static OffsetDateTime atNullable(Instant value) {
        return value == null ? null : at(value);
    }

    private static Instant instant(OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }
}
