package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.domain.ModelInvocationRecoveryLease;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Usage;
import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.domain.ProviderUsageFacts;
import com.robothree.central.modelgateway.domain.UsageAuthority;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import com.robothree.central.modelgateway.port.ModelInvocationEventRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRecoveryLeaseRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRepository;
import com.robothree.central.modelgateway.port.ModelUsageLedger;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

final class ModelInvocationPersistenceConformance {

    private static final Instant NOW = Instant.parse("2026-07-30T04:00:00Z");
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final UUID INVOCATION_ID =
            UUID.fromString("00000000-0000-4000-8000-000000002001");
    private static final UUID CLIENT_REQUEST_ID =
            UUID.fromString("00000000-0000-4000-8000-000000002002");
    private static final UUID REQUEST_ID =
            UUID.fromString("00000000-0000-4000-8000-000000002003");
    private static final UUID EVENT_ID =
            UUID.fromString("00000000-0000-4000-8000-000000002004");
    private static final UUID OUTBOX_ID =
            UUID.fromString("00000000-0000-4000-8000-000000002005");

    private ModelInvocationPersistenceConformance() {}

    static void verify(Harness persistence) {
        ModelInvocation accepted =
                accepted(INVOCATION_ID, CLIENT_REQUEST_ID, REQUEST_ID, A);
        assertThat(persistence.invocations().accept(accepted)).isEqualTo(accepted);
        assertThat(persistence.invocations().accept(accepted)).isEqualTo(accepted);
        assertThat(persistence.invocations().findById(INVOCATION_ID))
                .contains(accepted);
        assertThat(persistence.invocations().findByClientRequest(
                        accepted.clientRequestScope()))
                .contains(accepted);

        ModelInvocation drift = accepted(
                UUID.fromString("00000000-0000-4000-8000-000000002006"),
                CLIENT_REQUEST_ID,
                UUID.fromString("00000000-0000-4000-8000-000000002007"),
                B);
        assertThatThrownBy(() -> persistence.invocations().accept(drift))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.client_request_conflict");

        ModelInvocation running = running(accepted);
        ModelInvocationDurableEvent event = event(A, A);
        ModelInvocationRecoveryLease lease = lease(1, "central.node-a");
        ModelInvocationAuditOutbox outbox = outbox();
        persistence.transactions().required(() -> {
            assertThat(persistence.invocations().findByIdForUpdate(INVOCATION_ID))
                    .contains(accepted);
            persistence.invocations().update(running, 0);
            persistence.events().append(event);
            persistence.leases().insert(lease);
            persistence.outbox().insert(outbox);
            return null;
        });

        assertThat(persistence.invocations().findById(INVOCATION_ID))
                .contains(running);
        assertThat(persistence.events().findAfter(INVOCATION_ID, 0, 10))
                .containsExactly(event);
        assertThat(persistence.events().append(event)).isEqualTo(event);
        assertThat(persistence.leases().find(INVOCATION_ID)).contains(lease);
        assertThat(persistence.outbox().findPending(10)).containsExactly(outbox);

        if (persistence.outbox() instanceof ModelUsageLedger usageLedger) {
            verifyProviderUsageLedger(persistence, usageLedger);
        }

        assertThatThrownBy(() -> persistence.invocations().update(
                        terminal(running), 0))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.status_revision_conflict");
        assertThatThrownBy(() -> persistence.events().append(event(B, B)))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.event_sequence_conflict");

        ModelInvocationRecoveryLease takeover = lease(2, "central.node-b");
        assertThat(persistence.leases().replace(takeover, 1)).isEqualTo(takeover);
        assertThatThrownBy(() -> persistence.leases().replace(
                        lease(3, "central.node-a"), 1))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.fencing_epoch_conflict");

        ModelInvocation rollback = accepted(
                UUID.fromString("00000000-0000-4000-8000-000000002101"),
                UUID.fromString("00000000-0000-4000-8000-000000002102"),
                UUID.fromString("00000000-0000-4000-8000-000000002103"),
                C);
        assertThatThrownBy(() -> persistence.transactions().required(() -> {
                    persistence.invocations().accept(rollback);
                    throw new NamedRollback();
                }))
                .isInstanceOf(NamedRollback.class);
        assertThat(persistence.invocations().findById(rollback.invocationId()))
                .isEmpty();
    }

    private static void verifyProviderUsageLedger(
            Harness persistence,
            ModelUsageLedger usageLedger) {
        ModelProviderAttempt firstAttempt = attempt(1);
        assertThat(usageLedger.register(firstAttempt)).isEqualTo(firstAttempt);
        assertThat(usageLedger.register(firstAttempt)).isEqualTo(firstAttempt);
        assertThat(usageLedger.findAttempt(firstAttempt.identity())).contains(firstAttempt);

        ProviderUsageFact firstFact = fact(
                firstAttempt,
                Protocol.ANTHROPIC_COMPATIBLE,
                new Usage(5, 3, 2L, 1L, null),
                ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER,
                UUID.fromString("00000000-0000-4000-8000-000000002401"));
        assertThat(usageLedger.insert(firstFact)).isEqualTo(firstFact);
        assertThat(usageLedger.insert(firstFact)).isEqualTo(firstFact);
        assertThat(usageLedger.findUsageFact(firstAttempt.identity())).contains(firstFact);
        assertThat(firstFact.normalizedTotalInputTokens()).isEqualTo(8);

        ProviderUsageFact drifted = fact(
                firstAttempt,
                Protocol.ANTHROPIC_COMPATIBLE,
                new Usage(6, 3, 2L, 1L, null),
                ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER,
                UUID.fromString("00000000-0000-4000-8000-000000002402"));
        assertThatThrownBy(() -> usageLedger.insert(drifted))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.provider_usage_conflict");

        ModelProviderAttempt secondAttempt = attempt(2);
        usageLedger.register(secondAttempt);
        ProviderUsageFact secondFact = fact(
                secondAttempt,
                Protocol.OPENAI_COMPATIBLE,
                new Usage(11, 4, 7L, null, 2L),
                ProviderUsageFact.AttemptDisposition.SUPERSEDED_CONFIRMED,
                UUID.fromString("00000000-0000-4000-8000-000000002403"));
        usageLedger.insert(secondFact);
        assertThat(secondFact.normalizedTotalInputTokens()).isEqualTo(11);
        assertThat(usageLedger.findByInvocation(INVOCATION_ID))
                .containsExactly(firstFact, secondFact);

        ModelProviderAttempt unregistered = attempt(3);
        assertThatThrownBy(() -> usageLedger.insert(fact(
                        unregistered,
                        Protocol.OPENAI_COMPATIBLE,
                        new Usage(1, 1),
                        ProviderUsageFact.AttemptDisposition.SUPERSEDED_CONFIRMED,
                        UUID.fromString("00000000-0000-4000-8000-000000002404"))))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("model_gateway.provider_attempt_missing");

        ModelProviderAttempt rollbackAttempt = attempt(4);
        assertThatThrownBy(() -> persistence.transactions().required(() -> {
                    usageLedger.register(rollbackAttempt);
                    usageLedger.insert(fact(
                            rollbackAttempt,
                            Protocol.OPENAI_COMPATIBLE,
                            new Usage(2, 1),
                            ProviderUsageFact.AttemptDisposition.SUPERSEDED_CONFIRMED,
                            UUID.fromString("00000000-0000-4000-8000-000000002405")));
                    throw new NamedRollback();
                }))
                .isInstanceOf(NamedRollback.class);
        assertThat(usageLedger.findAttempt(rollbackAttempt.identity())).isEmpty();
        assertThat(usageLedger.findUsageFact(rollbackAttempt.identity())).isEmpty();
    }

    private static ModelProviderAttempt attempt(long epoch) {
        return new ModelProviderAttempt(
                UsageAuthority.CENTRAL_ENTERPRISE,
                INVOCATION_ID,
                ProviderUsageFacts.attemptKey(
                        UsageAuthority.CENTRAL_ENTERPRISE,
                        INVOCATION_ID,
                        epoch),
                epoch,
                NOW.plusSeconds(epoch));
    }

    private static ProviderUsageFact fact(
            ModelProviderAttempt attempt,
            Protocol protocol,
            Usage usage,
            ProviderUsageFact.AttemptDisposition disposition,
            UUID factId) {
        return ProviderUsageFacts.create(
                factId,
                attempt.usageAuthority(),
                attempt.authorityInvocationId(),
                attempt.fencingEpoch(),
                protocol,
                usage,
                disposition,
                NOW.plusSeconds(10 + attempt.fencingEpoch()));
    }

    static Harness harness(
            ModelInvocationRepository invocations,
            ModelInvocationEventRepository events,
            ModelInvocationRecoveryLeaseRepository leases,
            ModelInvocationAuditOutboxRepository outbox,
            CentralTransactionRunner transactions) {
        return new Harness(invocations, events, leases, outbox, transactions);
    }

    static void verifyConcurrentAccept(ModelInvocationRepository invocations)
            throws Exception {
        UUID clientRequestId =
                UUID.fromString("00000000-0000-4000-8000-000000002201");
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<java.util.concurrent.Future<ModelInvocation>> futures =
                    java.util.stream.IntStream.range(0, 32)
                            .mapToObj(index -> executor.submit(() -> {
                                start.await();
                                return invocations.accept(accepted(
                                        new UUID(0x4000L + index, 0x8000L + index),
                                        clientRequestId,
                                        new UUID(0x5000L + index, 0x9000L + index),
                                        C));
                            }))
                            .toList();
            start.countDown();
            HashSet<UUID> acceptedIds = new HashSet<>();
            for (var future : futures) {
                acceptedIds.add(future.get().invocationId());
            }
            assertThat(acceptedIds).hasSize(1);
        }

        ModelInvocation conflicting = accepted(
                UUID.fromString("00000000-0000-4000-8000-000000002301"),
                clientRequestId,
                UUID.fromString("00000000-0000-4000-8000-000000002302"),
                D);
        assertThatThrownBy(() -> invocations.accept(conflicting))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("model_gateway.client_request_conflict");
    }

    private static ModelInvocation accepted(
            UUID invocationId,
            UUID clientRequestId,
            UUID requestId,
            String requestDigest) {
        return new ModelInvocation(
                invocationId,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                "client.alpha",
                clientRequestId,
                requestId,
                requestDigest,
                "model.deepseek-v4-pro",
                B,
                C,
                D,
                "development_synthetic",
                A,
                NOW.plusSeconds(60),
                30_000,
                ModelInvocationStatus.ACCEPTED,
                0,
                0,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                NOW,
                null,
                null,
                NOW);
    }

    private static ModelInvocation running(ModelInvocation accepted) {
        return copy(
                accepted,
                ModelInvocationStatus.RUNNING,
                1,
                1,
                A,
                "dispatch_persisted",
                null,
                null,
                null,
                null,
                NOW.plusSeconds(1),
                null,
                NOW.plusSeconds(1));
    }

    private static ModelInvocation terminal(ModelInvocation running) {
        return copy(
                running,
                ModelInvocationStatus.COMPLETED,
                2,
                2,
                B,
                running.dispatchDecision(),
                "{\"inputTokens\":1,\"outputTokens\":1,\"totalTokens\":2}",
                "stop",
                null,
                null,
                running.startedAt(),
                NOW.plusSeconds(2),
                NOW.plusSeconds(2));
    }

    private static ModelInvocation copy(
            ModelInvocation source,
            ModelInvocationStatus status,
            long statusRevision,
            long sequence,
            String streamDigest,
            String dispatchDecision,
            String usageJson,
            String finishReason,
            String safeErrorCode,
            String safeSummary,
            Instant startedAt,
            Instant endedAt,
            Instant updatedAt) {
        return new ModelInvocation(
                source.invocationId(),
                source.enterpriseId(),
                source.userId(),
                source.deviceId(),
                source.clientInstanceId(),
                source.clientRequestId(),
                source.requestId(),
                source.requestDigest(),
                source.modelId(),
                source.modelRevision(),
                source.configurationRevision(),
                source.runtimeRegistryGeneration(),
                source.admissionType(),
                source.admissionDigest(),
                source.providerRequestDeadlineAt(),
                source.providerStreamIdleTimeoutMillis(),
                status,
                statusRevision,
                sequence,
                streamDigest,
                dispatchDecision,
                null,
                null,
                null,
                usageJson,
                finishReason,
                safeErrorCode,
                safeSummary,
                source.createdAt(),
                startedAt,
                endedAt,
                updatedAt);
    }

    private static ModelInvocationDurableEvent event(
            String eventDigest,
            String streamDigest) {
        return new ModelInvocationDurableEvent(
                INVOCATION_ID,
                1,
                EVENT_ID,
                "status_changed",
                ModelInvocationStatus.RUNNING,
                1,
                eventDigest,
                streamDigest,
                "{\"status\":\"running\"}",
                NOW.plusSeconds(1));
    }

    private static ModelInvocationRecoveryLease lease(long epoch, String owner) {
        Instant observed = NOW.plusSeconds(epoch);
        return new ModelInvocationRecoveryLease(
                INVOCATION_ID,
                owner,
                epoch,
                1,
                observed.plusSeconds(30),
                observed,
                epoch,
                D,
                observed);
    }

    private static ModelInvocationAuditOutbox outbox() {
        return new ModelInvocationAuditOutbox(
                OUTBOX_ID,
                INVOCATION_ID,
                EVENT_ID,
                "model_invocation_running",
                A,
                NOW.plusSeconds(1),
                null,
                0);
    }

    record Harness(
            ModelInvocationRepository invocations,
            ModelInvocationEventRepository events,
            ModelInvocationRecoveryLeaseRepository leases,
            ModelInvocationAuditOutboxRepository outbox,
            CentralTransactionRunner transactions) {}

    private static final class NamedRollback extends RuntimeException {}
}
