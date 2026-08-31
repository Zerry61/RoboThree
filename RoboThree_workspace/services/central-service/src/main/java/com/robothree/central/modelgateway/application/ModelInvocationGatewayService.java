package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer.EphemeralEvent;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

public final class ModelInvocationGatewayService {

    private static final int MAX_DURABLE_EVENT_QUERY_LIMIT = 1_000;

    private final ModelInvocationApplicationRuntime runtime;
    private final TransientModelProviderRequestSource requests;
    private final ModelInvocationEphemeralBuffer ephemeral;
    private final String nodeId;
    private final int subscriberCapacity;
    private final Set<UUID> activeExecutions = ConcurrentHashMap.newKeySet();

    public ModelInvocationGatewayService(
            ModelInvocationApplicationRuntime runtime,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            String nodeId,
            int subscriberCapacity) {
        this.runtime = Objects.requireNonNull(runtime, "runtime");
        this.requests = Objects.requireNonNull(requests, "requests");
        this.ephemeral = Objects.requireNonNull(ephemeral, "ephemeral");
        if (nodeId == null || nodeId.isBlank()) {
            throw new IllegalArgumentException("nodeId is required");
        }
        if (subscriberCapacity < 1 || subscriberCapacity > 1_024) {
            throw new IllegalArgumentException("subscriberCapacity is outside its limit");
        }
        this.nodeId = nodeId;
        this.subscriberCapacity = subscriberCapacity;
    }

    public ModelInvocation accept(
            String compactToken,
            AcceptCommand command,
            String canonicalProviderRequestJson) {
        requests.register(command.requestDigest(), canonicalProviderRequestJson);
        try {
            ModelInvocation invocation = runtime.accept(compactToken, command);
            if (invocation.status().isTerminal()) {
                requests.clear(command.requestDigest());
            }
            return invocation;
        } catch (RuntimeException exception) {
            requests.clear(command.requestDigest());
            throw exception;
        }
    }

    public ModelInvocation status(String compactToken, UUID invocationId) {
        return runtime.status(compactToken, invocationId);
    }

    public ModelInvocation cancel(
            String compactToken,
            UUID invocationId,
            long expectedStatusRevision,
            String reason) {
        ModelInvocation invocation = runtime.requestCancel(
                compactToken,
                invocationId,
                expectedStatusRevision,
                reason);
        if (invocation.status().isTerminal()) {
            requests.clear(invocation.requestDigest());
        }
        return invocation;
    }

    public LiveSubscription subscribe(
            String compactToken,
            UUID invocationId,
            long afterDurableSequence) {
        ModelInvocation initial = runtime.status(compactToken, invocationId);
        BlockingQueue<EphemeralEvent> queue = new ArrayBlockingQueue<>(subscriberCapacity);
        Continuity continuity = new Continuity();
        AutoCloseable handle = ephemeral.subscribe(invocationId, event -> {
            if (!queue.offer(event)) {
                continuity.markLost("subscriber_queue_overflow");
            }
        });
        List<ModelInvocationDurableEvent> durable = runtime.durableEvents(
                compactToken,
                invocationId,
                afterDurableSequence,
                MAX_DURABLE_EVENT_QUERY_LIMIT);
        LiveSubscription subscription = new LiveSubscription(
                compactToken,
                invocationId,
                runtime,
                queue,
                handle,
                continuity,
                initial,
                durable);
        if (initial.status().contractValue().equals("accepted")) {
            if (!startExecution(invocationId, false, continuity)
                    && ephemeral.snapshot(invocationId).lastSequence() > 0) {
                continuity.markLost("passive_subscription_missing_output");
            }
        } else if (initial.status().contractValue().equals("running")) {
            if (!startExecution(invocationId, true, continuity)
                    && ephemeral.snapshot(invocationId).lastSequence() > 0) {
                continuity.markLost("passive_subscription_missing_output");
            }
        }
        return subscription;
    }

    public int activeExecutionCount() {
        return activeExecutions.size();
    }

    private boolean startExecution(
            UUID invocationId,
            boolean recovery,
            Continuity continuity) {
        if (!activeExecutions.add(invocationId)) return false;
        Thread.ofVirtual()
                .name("robothree-model-invocation-" + invocationId)
                .start(() -> {
                    try {
                        ModelInvocation completed = recovery
                                ? runtime.recover(invocationId, nodeId)
                                : runtime.execute(invocationId, nodeId);
                        if (completed.status().isTerminal()) {
                            requests.clear(completed.requestDigest());
                        }
                    } catch (ModelGatewayException exception) {
                        // A passive subscriber cannot reconstruct ephemeral output owned by
                        // another process. Durable status remains authoritative, while the
                        // missing output is surfaced explicitly to the Core.
                        continuity.markLost(exception.code());
                    } finally {
                        activeExecutions.remove(invocationId);
                    }
                });
        return true;
    }

    public static final class LiveSubscription implements AutoCloseable {

        private final String compactToken;
        private final UUID invocationId;
        private final ModelInvocationApplicationRuntime runtime;
        private final BlockingQueue<EphemeralEvent> queue;
        private final AutoCloseable handle;
        private final Continuity continuity;
        private final ModelInvocation initial;
        private final List<ModelInvocationDurableEvent> initialDurable;
        private volatile boolean closed;

        private LiveSubscription(
                String compactToken,
                UUID invocationId,
                ModelInvocationApplicationRuntime runtime,
                BlockingQueue<EphemeralEvent> queue,
                AutoCloseable handle,
                Continuity continuity,
                ModelInvocation initial,
                List<ModelInvocationDurableEvent> initialDurable) {
            this.compactToken = compactToken;
            this.invocationId = invocationId;
            this.runtime = runtime;
            this.queue = queue;
            this.handle = handle;
            this.continuity = continuity;
            this.initial = initial;
            this.initialDurable = List.copyOf(initialDurable);
        }

        public ModelInvocation initialStatus() { return initial; }
        public List<ModelInvocationDurableEvent> initialDurableEvents() {
            return initialDurable;
        }
        public List<EphemeralEvent> pollAvailable(long timeoutMillis)
                throws InterruptedException {
            EphemeralEvent first = queue.poll(
                    timeoutMillis,
                    java.util.concurrent.TimeUnit.MILLISECONDS);
            if (first == null) {
                return List.of();
            }
            List<EphemeralEvent> available = new ArrayList<>();
            available.add(first);
            queue.drainTo(available);
            return List.copyOf(available);
        }
        public ModelInvocation currentStatus() {
            return runtime.status(compactToken, invocationId);
        }
        public List<ModelInvocationDurableEvent> durableAfter(long sequence) {
            return runtime.durableEvents(
                    compactToken,
                    invocationId,
                    sequence,
                    MAX_DURABLE_EVENT_QUERY_LIMIT);
        }
        public boolean continuityLost() { return continuity.lost; }
        public String continuityFailureCode() { return continuity.failureCode; }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            try { handle.close(); } catch (Exception ignored) {
                // Subscription cleanup cannot alter durable facts.
            }
        }
    }

    private static final class Continuity {
        private volatile boolean lost;
        private volatile String failureCode = "none";

        private void markLost(String code) {
            lost = true;
            failureCode = code;
        }
    }
}
