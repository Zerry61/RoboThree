package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ModelInvocationGatewayServiceTest {

    @Test
    void subscribesBeforeOneLocalOwnerExecutesAndCleansTransientRequest() throws Exception {
        UUID invocationId = UUID.randomUUID();
        String requestDigest = "a".repeat(64);
        var buffer = new ModelInvocationEphemeralBuffer(32, 65_536);
        var requests = new TransientModelProviderRequestSource();
        requests.register(requestDigest, "{\"messages\":[{\"role\":\"user\"}]}");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        var runtime = new FakeRuntime(
                invocation(invocationId, requestDigest, ModelInvocationStatus.ACCEPTED),
                invocation(invocationId, requestDigest, ModelInvocationStatus.COMPLETED));
        runtime.onExecute = () -> {
            assertThat(buffer.subscriberCount(invocationId)).isEqualTo(1);
            buffer.appendStarted(invocationId, Instant.parse("2026-08-03T06:00:00Z"));
            entered.countDown();
            try { assertThat(release.await(2, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
        };
        var service = new ModelInvocationGatewayService(
                runtime, requests, buffer, "node-one", 8);

        var first = service.subscribe("token", invocationId, 0);
        assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
        var second = service.subscribe("token", invocationId, 0);
        assertThat(runtime.executeCount.get()).isEqualTo(1);
        assertThat(service.activeExecutionCount()).isEqualTo(1);
        assertThat(first.pollAvailable(100)).hasSize(1);
        assertThat(first.continuityLost()).isFalse();
        assertThat(second.continuityLost()).isTrue();

        release.countDown();
        awaitZero(service);
        assertThat(requests.size()).isZero();
        first.close();
        second.close();
        assertThat(buffer.subscriberCount(invocationId)).isZero();
    }

    @Test
    void runningSubscriptionUsesRecoveryAndAnAcceptFailureClearsRequestContent() {
        UUID invocationId = UUID.randomUUID();
        String requestDigest = "b".repeat(64);
        ModelInvocation running = invocation(
                invocationId, requestDigest, ModelInvocationStatus.RUNNING);
        var runtime = new FakeRuntime(running, running);
        var requests = new TransientModelProviderRequestSource();
        var service = new ModelInvocationGatewayService(
                runtime,
                requests,
                new ModelInvocationEphemeralBuffer(8, 8_192),
                "node-two",
                8);

        service.subscribe("token", invocationId, 0).close();
        awaitCount(runtime.recoverCount, 1);
        assertThat(runtime.executeCount.get()).isZero();

        runtime.failAccept = true;
        var command = command(requestDigest);
        assertThatThrownBy(() -> service.accept("invalid", command, "{\"safe\":true}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(requests.size()).isZero();
    }

    @Test
    void passiveRunningSubscriptionReportsContinuityLossWhenAnotherOwnerHoldsTheLease() {
        UUID invocationId = UUID.randomUUID();
        String requestDigest = "c".repeat(64);
        ModelInvocation running = invocation(
                invocationId, requestDigest, ModelInvocationStatus.RUNNING);
        var runtime = new FakeRuntime(running, running);
        runtime.failRecovery = true;
        var service = new ModelInvocationGatewayService(
                runtime,
                new TransientModelProviderRequestSource(),
                new ModelInvocationEphemeralBuffer(8, 8_192),
                "passive-node",
                8);

        var subscription = service.subscribe("token", invocationId, 0);

        awaitCount(runtime.recoverCount, 1);
        awaitContinuityLoss(subscription);
        assertThat(runtime.executeCount.get()).isZero();
        subscription.close();
    }

    @Test
    void boundsInitialAndSubsequentDurableEventQueriesToPersistenceLimit() {
        UUID invocationId = UUID.randomUUID();
        String requestDigest = "d".repeat(64);
        ModelInvocation completed = invocation(
                invocationId,
                requestDigest,
                ModelInvocationStatus.COMPLETED);
        var runtime = new FakeRuntime(completed, completed);
        var service = new ModelInvocationGatewayService(
                runtime,
                new TransientModelProviderRequestSource(),
                new ModelInvocationEphemeralBuffer(8, 8_192),
                "bounded-node",
                8);

        try (var subscription = service.subscribe("token", invocationId, 0)) {
            subscription.durableAfter(0);
        }

        assertThat(runtime.durableLimits).containsExactly(1_000, 1_000);
    }

    @Test
    void drainsAllAvailableEphemeralEventsBeforeTerminalFactsAreRead()
            throws Exception {
        UUID invocationId = UUID.randomUUID();
        String requestDigest = "e".repeat(64);
        var buffer = new ModelInvocationEphemeralBuffer(32, 65_536);
        var runtime = new FakeRuntime(
                invocation(invocationId, requestDigest, ModelInvocationStatus.ACCEPTED),
                invocation(invocationId, requestDigest, ModelInvocationStatus.COMPLETED));
        runtime.onExecute = () -> {
            buffer.appendStarted(
                    invocationId,
                    Instant.parse("2026-08-03T06:00:00Z"));
            buffer.appendText(
                    invocationId,
                    "second turn",
                    Instant.parse("2026-08-03T06:00:01Z"));
        };
        var service = new ModelInvocationGatewayService(
                runtime,
                new TransientModelProviderRequestSource(),
                buffer,
                "drain-node",
                8);

        try (var subscription = service.subscribe("token", invocationId, 0)) {
            awaitZero(service);
            assertThat(subscription.pollAvailable(100))
                    .extracting(ModelInvocationEphemeralBuffer.EphemeralEvent::eventType)
                    .containsExactly("started", "text_delta");
        }
    }

    private static final class FakeRuntime implements ModelInvocationApplicationRuntime {
        private final ModelInvocation initial;
        private final ModelInvocation result;
        private final AtomicInteger executeCount = new AtomicInteger();
        private final AtomicInteger recoverCount = new AtomicInteger();
        private final CopyOnWriteArrayList<Integer> durableLimits =
                new CopyOnWriteArrayList<>();
        private volatile Runnable onExecute = () -> {};
        private volatile boolean failAccept;
        private volatile boolean failRecovery;

        private FakeRuntime(ModelInvocation initial, ModelInvocation result) {
            this.initial = initial;
            this.result = result;
        }

        @Override
        public ModelInvocation accept(String token, ModelInvocationRuntime.AcceptCommand command) {
            if (failAccept) throw new IllegalArgumentException("denied");
            return initial;
        }

        @Override
        public ModelInvocation execute(UUID invocationId, String ownerNodeId) {
            executeCount.incrementAndGet();
            onExecute.run();
            return result;
        }

        @Override
        public ModelInvocation recover(UUID invocationId, String ownerNodeId) {
            recoverCount.incrementAndGet();
            if (failRecovery) {
                throw ModelGatewayException.conflict(
                        "model_recovery_lease_not_expired",
                        "Another execution owner still holds the lease.");
            }
            return result;
        }

        @Override
        public ModelInvocation requestCancel(
                String token, UUID invocationId, long revision, String reason) {
            return result;
        }

        @Override
        public ModelInvocation status(String token, UUID invocationId) { return initial; }

        @Override
        public List<ModelInvocationDurableEvent> durableEvents(
                String token, UUID invocationId, long afterSequence, int limit) {
            durableLimits.add(limit);
            return List.of();
        }
    }

    private static ModelInvocationRuntime.AcceptCommand command(String requestDigest) {
        return new ModelInvocationRuntime.AcceptCommand(
                UUID.randomUUID(),
                UUID.randomUUID(),
                requestDigest,
                "model.enterprise",
                "1".repeat(64),
                "2".repeat(64),
                "3".repeat(64),
                "user_confirmed",
                "4".repeat(64),
                Instant.parse("2099-08-03T06:05:00Z"),
                30_000);
    }

    private static ModelInvocation invocation(
            UUID invocationId,
            String requestDigest,
            ModelInvocationStatus status) {
        Instant createdAt = Instant.parse("2026-08-03T06:00:00Z");
        boolean accepted = status == ModelInvocationStatus.ACCEPTED;
        boolean running = status == ModelInvocationStatus.RUNNING;
        boolean terminal = status.isTerminal();
        return new ModelInvocation(
                invocationId,
                "enterprise-one",
                "user-one",
                "device-one",
                "client-one",
                UUID.randomUUID(),
                UUID.randomUUID(),
                requestDigest,
                "model.enterprise",
                "1".repeat(64),
                "2".repeat(64),
                "3".repeat(64),
                "user_confirmed",
                "4".repeat(64),
                Instant.parse("2099-08-03T06:05:00Z"),
                30_000,
                status,
                accepted ? 0 : terminal ? 2 : 1,
                accepted ? 1 : terminal ? 3 : 2,
                "5".repeat(64),
                running || terminal ? "6".repeat(64) : null,
                null,
                null,
                null,
                null,
                terminal ? "stop" : null,
                null,
                null,
                createdAt,
                running || terminal ? createdAt.plusSeconds(1) : null,
                terminal ? createdAt.plusSeconds(2) : null,
                terminal ? createdAt.plusSeconds(2) : createdAt);
    }

    private static void awaitZero(ModelInvocationGatewayService service) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (service.activeExecutionCount() != 0 && System.nanoTime() < deadline) {
            Thread.sleep(5);
        }
        assertThat(service.activeExecutionCount()).isZero();
    }

    private static void awaitCount(AtomicInteger counter, int expected) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (counter.get() != expected && System.nanoTime() < deadline) {
            try { Thread.sleep(5); } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
        }
        assertThat(counter.get()).isEqualTo(expected);
    }

    private static void awaitContinuityLoss(
            ModelInvocationGatewayService.LiveSubscription subscription) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (!subscription.continuityLost() && System.nanoTime() < deadline) {
            try { Thread.sleep(5); } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
        }
        assertThat(subscription.continuityLost()).isTrue();
    }
}
