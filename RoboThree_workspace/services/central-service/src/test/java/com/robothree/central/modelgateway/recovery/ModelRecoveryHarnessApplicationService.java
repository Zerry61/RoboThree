package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

final class ModelRecoveryHarnessApplicationService {

    private final String nodeId;
    private final ModelInvocationRuntime runtime;
    private final HarnessModelInvocationBackend backend;
    private final TransientModelProviderRequestSource requests;
    private final HikariDataSource dataSource;
    private final AtomicInteger activeSseSubscribers = new AtomicInteger();

    ModelRecoveryHarnessApplicationService(
            String nodeId,
            ModelInvocationRuntime runtime,
            HarnessModelInvocationBackend backend,
            TransientModelProviderRequestSource requests,
            HikariDataSource dataSource) {
        this.nodeId = nodeId;
        this.runtime = runtime;
        this.backend = backend;
        this.requests = requests;
        this.dataSource = dataSource;
    }

    OperationView accept(AcceptRequest request) {
        requests.register(
                request.requestDigest(),
                ModelRecoveryHarnessFacts.providerRequest());
        return invoke(() -> runtime.acceptV1Alpha2(
                ModelRecoveryHarnessFacts.ACCESS_TOKEN,
                new ModelInvocationRuntime.AcceptCommand(
                        request.clientRequestId(),
                        request.requestId(),
                        request.requestDigest(),
                        ModelRecoveryHarnessFacts.MODEL_ID,
                        ModelRecoveryHarnessFacts.MODEL_REVISION,
                        ModelRecoveryHarnessFacts.CONFIGURATION_REVISION,
                        ModelRecoveryHarnessFacts.REGISTRY_GENERATION,
                        "development_synthetic",
                        ModelRecoveryHarnessFacts.ADMISSION_DIGEST,
                        Instant.now().plusSeconds(120),
                        10_000),
                ModelRecoveryHarnessFacts.SESSION_SCOPE_DIGEST,
                ModelRecoveryHarnessFacts.CACHE_CONTEXT_DIGEST));
    }

    OperationView execute(InvocationCommand command) {
        return invoke(() -> runtime.execute(command.invocationId(), nodeId));
    }

    OperationView recover(InvocationCommand command) {
        return invoke(() -> runtime.recover(command.invocationId(), nodeId));
    }

    OperationView cancel(CancelCommand command) {
        return invoke(() -> runtime.requestCancel(
                ModelRecoveryHarnessFacts.ACCESS_TOKEN,
                command.invocationId(),
                command.expectedStatusRevision(),
                "user_requested"));
    }

    OperationView status(UUID invocationId) {
        return invoke(() -> runtime.status(
                ModelRecoveryHarnessFacts.ACCESS_TOKEN,
                invocationId));
    }

    String durableSse(UUID invocationId, long afterSequence) {
        activeSseSubscribers.incrementAndGet();
        try {
            List<ModelInvocationDurableEvent> events = runtime.durableEvents(
                    ModelRecoveryHarnessFacts.ACCESS_TOKEN,
                    invocationId,
                    afterSequence,
                    100);
            StringBuilder body = new StringBuilder();
            for (ModelInvocationDurableEvent event : events) {
                body.append("id: ")
                        .append(event.eventSequence())
                        .append('\n')
                        .append("event: ")
                        .append(event.eventType())
                        .append('\n')
                        .append("data: {\"status\":\"")
                        .append(event.status().contractValue())
                        .append("\",\"statusRevision\":")
                        .append(event.statusRevision())
                        .append("}\n\n");
            }
            return body.toString();
        } finally {
            activeSseSubscribers.decrementAndGet();
        }
    }

    HarnessModelInvocationBackend.BackendState configureBackend(
            HarnessModelInvocationBackend.BackendCommand command) {
        return backend.configure(command);
    }

    HarnessModelInvocationBackend.BackendState releaseBackend() {
        return backend.release();
    }

    HarnessModelInvocationBackend.BackendState backendState() {
        return backend.state();
    }

    NodeInfo nodeInfo() {
        return new NodeInfo(nodeId, ProcessHandle.current().pid());
    }

    ResourceInfo resources() {
        var pool = dataSource.getHikariPoolMXBean();
        return new ResourceInfo(
                nodeId,
                dataSource.getPoolName(),
                pool == null ? 0 : pool.getActiveConnections(),
                pool == null ? 0 : pool.getIdleConnections(),
                pool == null ? 0 : pool.getTotalConnections(),
                pool == null ? 0 : pool.getThreadsAwaitingConnection(),
                activeSseSubscribers.get(),
                backend.state().blocked(),
                ManagementFactory.getThreadMXBean().getThreadCount());
    }

    private OperationView invoke(Supplier<ModelInvocation> work) {
        try {
            return new OperationView(true, toView(work.get()), null);
        } catch (ModelGatewayException exception) {
            return new OperationView(false, null, exception.code());
        } catch (PersistenceConflictException exception) {
            return new OperationView(false, null, exception.code());
        } catch (PersistenceIntegrityException exception) {
            return new OperationView(false, null, exception.code());
        }
    }

    private static InvocationView toView(ModelInvocation invocation) {
        return new InvocationView(
                invocation.invocationId(),
                invocation.status().contractValue(),
                invocation.statusRevision(),
                invocation.lastDurableEventSequence(),
                invocation.dispatchDecision(),
                invocation.cancelReason(),
                invocation.safeErrorCode());
    }

    record AcceptRequest(
            UUID clientRequestId,
            UUID requestId,
            String requestDigest) {}

    record InvocationCommand(UUID invocationId) {}

    record CancelCommand(
            UUID invocationId,
            long expectedStatusRevision) {}

    record InvocationView(
            UUID invocationId,
            String status,
            long statusRevision,
            long lastDurableEventSequence,
            String dispatchDecision,
            String cancelReason,
            String safeErrorCode) {}

    record OperationView(
            boolean succeeded,
            InvocationView invocation,
            String errorCode) {}

    record NodeInfo(String nodeId, long processId) {}

    record ResourceInfo(
            String nodeId,
            String poolName,
            int activeConnections,
            int idleConnections,
            int totalConnections,
            int awaitingConnections,
            int activeSseSubscribers,
            boolean blockedExecution,
            int liveThreadCount) {}
}
