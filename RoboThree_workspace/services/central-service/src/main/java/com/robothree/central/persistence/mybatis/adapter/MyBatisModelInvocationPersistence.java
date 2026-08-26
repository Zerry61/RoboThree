package com.robothree.central.persistence.mybatis.adapter;

import static com.robothree.central.persistence.mybatis.adapter.MyBatisPersistenceErrors.write;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.domain.ModelInvocationRecoveryLease;
import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import com.robothree.central.modelgateway.port.ModelInvocationCacheContextRepository;
import com.robothree.central.modelgateway.port.ModelInvocationEventRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRecoveryLeaseRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRepository;
import com.robothree.central.modelgateway.port.ModelUsageLedger;
import com.robothree.central.modelgateway.port.PromptCachePlanRepository;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.mybatis.mapper.ModelInvocationPersistenceMapper;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisModelInvocationPersistence implements
        ModelInvocationRepository,
        ModelInvocationEventRepository,
        ModelInvocationRecoveryLeaseRepository,
        ModelInvocationAuditOutboxRepository,
        ModelInvocationCacheContextRepository,
        PromptCachePlanRepository,
        ModelUsageLedger {

    private static final int MAX_READ_LIMIT = 1_000;

    private final ModelInvocationPersistenceMapper mapper;

    public MyBatisModelInvocationPersistence(ModelInvocationPersistenceMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    @Override
    public ModelInvocation accept(ModelInvocation invocation) {
        int inserted = write(
                () -> mapper.insertInvocation(
                        ModelInvocationEntityConverter.toEntity(invocation)),
                "model_gateway.client_request_conflict",
                "model_gateway.invocation_write_failed");
        if (inserted == 1) {
            return invocation;
        }
        Optional<ModelInvocation> existing =
                findByClientRequest(invocation.clientRequestScope());
        if (existing.isPresent()
                && existing.get().requestDigest().equals(invocation.requestDigest())) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.client_request_conflict",
                "client request id is already bound to a different request digest");
    }

    @Override
    public Optional<ModelInvocation> findById(UUID invocationId) {
        return Optional.ofNullable(mapper.findInvocationById(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public Optional<ModelInvocation> findByClientRequest(
            ModelInvocation.ClientRequestScope scope) {
        return Optional.ofNullable(mapper.findInvocationByClientRequest(
                        scope.enterpriseId(),
                        scope.userId(),
                        scope.deviceId(),
                        scope.clientInstanceId(),
                        scope.clientRequestId()))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public Optional<ModelInvocation> findByIdForUpdate(UUID invocationId) {
        return Optional.ofNullable(mapper.findInvocationByIdForUpdate(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public ModelInvocation update(
            ModelInvocation invocation,
            long expectedStatusRevision) {
        int updated = write(
                () -> mapper.updateInvocation(
                        ModelInvocationEntityConverter.toEntity(invocation),
                        expectedStatusRevision),
                "model_gateway.status_revision_conflict",
                "model_gateway.invocation_write_failed");
        if (updated != 1) {
            throw conflict(
                    "model_gateway.status_revision_conflict",
                    "invocation status revision changed");
        }
        return invocation;
    }

    @Override
    public ModelInvocationDurableEvent append(ModelInvocationDurableEvent event) {
        int inserted = write(
                () -> mapper.insertEvent(ModelInvocationEntityConverter.toEntity(event)),
                "model_gateway.event_sequence_conflict",
                "model_gateway.event_write_failed");
        if (inserted == 1) {
            return event;
        }
        Optional<ModelInvocationDurableEvent> existing =
                Optional.ofNullable(mapper.findEventBySequence(
                                event.invocationId(), event.eventSequence()))
                        .map(ModelInvocationEntityConverter::toDomain);
        if (existing.isPresent() && existing.get().equals(event)) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.event_sequence_conflict",
                "durable event sequence is already bound to different data");
    }

    @Override
    public List<ModelInvocationDurableEvent> findAfter(
            UUID invocationId,
            long afterSequence,
            int limit) {
        if (afterSequence < 0) {
            throw new IllegalArgumentException("afterSequence must not be negative");
        }
        return mapper.findEventsAfter(
                        invocationId,
                        afterSequence,
                        boundedLimit(limit))
                .stream()
                .map(ModelInvocationEntityConverter::toDomain)
                .toList();
    }

    @Override
    public ModelInvocationRecoveryLease insert(ModelInvocationRecoveryLease lease) {
        int inserted = write(
                () -> mapper.insertLease(ModelInvocationEntityConverter.toEntity(lease)),
                "model_gateway.lease_conflict",
                "model_gateway.lease_write_failed");
        if (inserted == 1) {
            return lease;
        }
        Optional<ModelInvocationRecoveryLease> existing = find(lease.invocationId());
        if (existing.isPresent() && existing.get().equals(lease)) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.lease_conflict",
                "invocation lease already has different data");
    }

    @Override
    public Optional<ModelInvocationRecoveryLease> find(UUID invocationId) {
        return Optional.ofNullable(mapper.findLease(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public Optional<ModelInvocationRecoveryLease> findForUpdate(UUID invocationId) {
        return Optional.ofNullable(mapper.findLeaseForUpdate(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public Instant currentDatabaseTime() {
        return mapper.currentDatabaseTime();
    }

    @Override
    public ModelInvocationRecoveryLease replace(
            ModelInvocationRecoveryLease lease,
            long expectedFencingEpoch) {
        int updated = write(
                () -> mapper.replaceLease(
                        ModelInvocationEntityConverter.toEntity(lease),
                        expectedFencingEpoch),
                "model_gateway.fencing_epoch_conflict",
                "model_gateway.lease_write_failed");
        if (updated != 1) {
            throw conflict(
                    "model_gateway.fencing_epoch_conflict",
                    "invocation lease fencing epoch changed");
        }
        return lease;
    }

    @Override
    public ModelInvocationAuditOutbox insert(ModelInvocationAuditOutbox outbox) {
        int inserted = write(
                () -> mapper.insertAuditOutbox(
                        ModelInvocationEntityConverter.toEntity(outbox)),
                "model_gateway.audit_outbox_conflict",
                "model_gateway.audit_outbox_write_failed");
        if (inserted == 1) {
            return outbox;
        }
        Optional<ModelInvocationAuditOutbox> existing =
                Optional.ofNullable(mapper.findAuditOutboxById(outbox.outboxId()))
                        .map(ModelInvocationEntityConverter::toDomain);
        if (existing.isPresent() && existing.get().equals(outbox)) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.audit_outbox_conflict",
                "audit outbox id is already bound to different data");
    }

    @Override
    public List<ModelInvocationAuditOutbox> findPending(int limit) {
        return mapper.findPendingAuditOutbox(boundedLimit(limit))
                .stream()
                .map(ModelInvocationEntityConverter::toDomain)
                .toList();
    }

    @Override
    public ModelProviderAttempt register(ModelProviderAttempt attempt) {
        int inserted = write(
                () -> mapper.insertProviderAttempt(
                        ModelInvocationEntityConverter.toEntity(attempt)),
                "model_gateway.provider_attempt_conflict",
                "model_gateway.provider_attempt_write_failed");
        if (inserted == 1) {
            return attempt;
        }
        Optional<ModelProviderAttempt> existing = findAttempt(attempt.identity());
        if (existing.isPresent() && existing.get().equals(attempt)) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.provider_attempt_conflict",
                "provider attempt identity is already bound to different data");
    }

    @Override
    public Optional<ModelProviderAttempt> findAttempt(
            ModelProviderAttempt.AttemptIdentity identity) {
        return Optional.ofNullable(mapper.findProviderAttempt(
                        identity.usageAuthority().contractValue(),
                        identity.authorityInvocationId(),
                        identity.providerAttemptKey()))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public ProviderUsageFact insert(ProviderUsageFact fact) {
        if (findAttempt(fact.attemptIdentity()).isEmpty()) {
            throw new com.robothree.central.persistence.PersistenceIntegrityException(
                    "model_gateway.provider_attempt_missing",
                    "Provider Usage references an unregistered attempt");
        }
        int inserted = write(
                () -> mapper.insertProviderUsageFact(
                        ModelInvocationEntityConverter.toEntity(fact)),
                "model_gateway.provider_usage_conflict",
                "model_gateway.provider_usage_write_failed");
        if (inserted == 1) {
            return fact;
        }
        Optional<ProviderUsageFact> existing = findUsageFact(fact.attemptIdentity());
        if (existing.isPresent()
                && existing.get().usageDigest().equals(fact.usageDigest())) {
            return existing.get();
        }
        throw conflict(
                "model_gateway.provider_usage_conflict",
                "Provider Usage attempt is already bound to a different digest");
    }

    @Override
    public Optional<ProviderUsageFact> findUsageFact(
            ModelProviderAttempt.AttemptIdentity identity) {
        return Optional.ofNullable(mapper.findProviderUsageFact(
                        identity.usageAuthority().contractValue(),
                        identity.authorityInvocationId(),
                        identity.providerAttemptKey()))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public List<ProviderUsageFact> findByInvocation(UUID authorityInvocationId) {
        return mapper.findProviderUsageFactsByInvocation(authorityInvocationId)
                .stream()
                .map(ModelInvocationEntityConverter::toDomain)
                .toList();
    }

    @Override
    public Optional<ModelInvocationCacheContext> findContextByInvocationId(UUID invocationId) {
        return Optional.ofNullable(mapper.findCacheContext(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public ModelInvocationCacheContext insertImmutable(
            ModelInvocationCacheContext context) {
        int inserted = write(
                () -> mapper.insertCacheContext(
                        ModelInvocationEntityConverter.toEntity(context)),
                "model_gateway.cache_context_conflict",
                "model_gateway.cache_context_write_failed");
        if (inserted == 1) return context;
        Optional<ModelInvocationCacheContext> existing =
                findContextByInvocationId(context.invocationId());
        if (existing.isPresent() && existing.get().equals(context)) return existing.get();
        throw conflict(
                "model_gateway.cache_context_conflict",
                "invocation cache context is already bound to different data");
    }

    @Override
    public Optional<PromptCachePlan> findPlanByInvocationId(UUID invocationId) {
        return Optional.ofNullable(mapper.findPromptCachePlan(invocationId))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public Optional<PromptCachePlan> findLatestByMonotonicityIdentity(
            PromptCachePlan.MonotonicityIdentity identity) {
        return Optional.ofNullable(mapper.findLatestPromptCachePlanByIdentity(
                        identity.cacheScopeIdDigest(),
                        identity.staticSourceLockDigest(),
                        identity.bindingRevision(),
                        identity.bindingDigest(),
                        identity.profileRevision(),
                        identity.profileDigest(),
                        identity.compatibilityFingerprintDigest(),
                        identity.cachePolicyRevision(),
                        identity.providerProjectionMode().contractValue()))
                .map(ModelInvocationEntityConverter::toDomain);
    }

    @Override
    public PromptCachePlan insertImmutable(PromptCachePlan plan) {
        int inserted = write(
                () -> mapper.insertPromptCachePlan(
                        ModelInvocationEntityConverter.toEntity(plan)),
                "model_gateway.cache_plan_conflict",
                "model_gateway.cache_plan_write_failed");
        if (inserted == 1) return plan;
        Optional<PromptCachePlan> existing = findPlanByInvocationId(plan.invocationId());
        if (existing.isPresent() && existing.get().equals(plan)) return existing.get();
        throw conflict(
                "model_gateway.cache_plan_conflict",
                "invocation prompt cache plan is already bound to different data");
    }

    private static int boundedLimit(int limit) {
        if (limit < 1 || limit > MAX_READ_LIMIT) {
            throw new IllegalArgumentException("limit is outside the supported range");
        }
        return limit;
    }

    private static PersistenceConflictException conflict(String code, String message) {
        return new PersistenceConflictException(code, message);
    }
}
