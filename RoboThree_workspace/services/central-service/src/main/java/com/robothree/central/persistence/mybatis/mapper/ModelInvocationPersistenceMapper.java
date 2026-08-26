package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.ModelInvocationAuditOutboxEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationEventEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationRecoveryLeaseEntity;
import com.robothree.central.persistence.mybatis.entity.ModelInvocationCacheContextEntity;
import com.robothree.central.persistence.mybatis.entity.PromptCachePlanEntity;
import com.robothree.central.persistence.mybatis.entity.ModelProviderAttemptEntity;
import com.robothree.central.persistence.mybatis.entity.ProviderUsageFactEntity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ModelInvocationPersistenceMapper {

    int insertInvocation(ModelInvocationEntity invocation);

    ModelInvocationEntity findInvocationById(@Param("invocationId") UUID invocationId);

    ModelInvocationEntity findInvocationByIdForUpdate(
            @Param("invocationId") UUID invocationId);

    ModelInvocationEntity findInvocationByClientRequest(
            @Param("enterpriseId") String enterpriseId,
            @Param("userId") String userId,
            @Param("deviceId") String deviceId,
            @Param("clientInstanceId") String clientInstanceId,
            @Param("clientRequestId") UUID clientRequestId);

    int updateInvocation(
            @Param("invocation") ModelInvocationEntity invocation,
            @Param("expectedStatusRevision") long expectedStatusRevision);

    int insertEvent(ModelInvocationEventEntity event);

    ModelInvocationEventEntity findEventBySequence(
            @Param("invocationId") UUID invocationId,
            @Param("eventSequence") long eventSequence);

    List<ModelInvocationEventEntity> findEventsAfter(
            @Param("invocationId") UUID invocationId,
            @Param("afterSequence") long afterSequence,
            @Param("limit") int limit);

    int insertLease(ModelInvocationRecoveryLeaseEntity lease);

    ModelInvocationRecoveryLeaseEntity findLease(
            @Param("invocationId") UUID invocationId);

    ModelInvocationRecoveryLeaseEntity findLeaseForUpdate(
            @Param("invocationId") UUID invocationId);

    Instant currentDatabaseTime();

    int replaceLease(
            @Param("lease") ModelInvocationRecoveryLeaseEntity lease,
            @Param("expectedFencingEpoch") long expectedFencingEpoch);

    int insertAuditOutbox(ModelInvocationAuditOutboxEntity outbox);

    ModelInvocationAuditOutboxEntity findAuditOutboxById(
            @Param("outboxId") UUID outboxId);

    List<ModelInvocationAuditOutboxEntity> findPendingAuditOutbox(
            @Param("limit") int limit);

    int insertProviderAttempt(ModelProviderAttemptEntity attempt);

    ModelProviderAttemptEntity findProviderAttempt(
            @Param("usageAuthority") String usageAuthority,
            @Param("authorityInvocationId") UUID authorityInvocationId,
            @Param("providerAttemptKey") String providerAttemptKey);

    int insertProviderUsageFact(ProviderUsageFactEntity fact);

    ProviderUsageFactEntity findProviderUsageFact(
            @Param("usageAuthority") String usageAuthority,
            @Param("authorityInvocationId") UUID authorityInvocationId,
            @Param("providerAttemptKey") String providerAttemptKey);

    List<ProviderUsageFactEntity> findProviderUsageFactsByInvocation(
            @Param("authorityInvocationId") UUID authorityInvocationId);

    int insertCacheContext(ModelInvocationCacheContextEntity context);

    ModelInvocationCacheContextEntity findCacheContext(
            @Param("invocationId") UUID invocationId);

    int insertPromptCachePlan(PromptCachePlanEntity plan);

    PromptCachePlanEntity findPromptCachePlan(
            @Param("invocationId") UUID invocationId);

    PromptCachePlanEntity findLatestPromptCachePlanByIdentity(
            @Param("cacheScopeIdDigest") String cacheScopeIdDigest,
            @Param("staticSourceLockDigest") String staticSourceLockDigest,
            @Param("bindingRevision") String bindingRevision,
            @Param("bindingDigest") String bindingDigest,
            @Param("profileRevision") String profileRevision,
            @Param("profileDigest") String profileDigest,
            @Param("compatibilityFingerprintDigest") String compatibilityFingerprintDigest,
            @Param("cachePolicyRevision") String cachePolicyRevision,
            @Param("providerProjectionMode") String providerProjectionMode);
}
