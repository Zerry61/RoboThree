package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingVersion;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.RunIdentity;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

final class Cgf2b32HarnessApplicationService {

    private final String nodeId;
    private final ModelInvocationRuntime runtime;
    private final Cgf2b32FailpointBackend backend;
    private final Cgf2b32SelectionState selection;
    private final RunIdentity runIdentity;
    private final ModelInvocationEphemeralBuffer ephemeral;
    private final HikariDataSource dataSource;
    private final AtomicInteger activeSseSubscribers = new AtomicInteger();

    Cgf2b32HarnessApplicationService(
            String nodeId,
            ModelInvocationRuntime runtime,
            Cgf2b32FailpointBackend backend,
            Cgf2b32SelectionState selection,
            RunIdentity runIdentity,
            ModelInvocationEphemeralBuffer ephemeral,
            HikariDataSource dataSource) {
        this.nodeId = nodeId;
        this.runtime = runtime;
        this.backend = backend;
        this.selection = selection;
        this.runIdentity = runIdentity;
        this.ephemeral = ephemeral;
        this.dataSource = dataSource;
    }

    OperationView accept(AcceptRequest request) {
        BindingVersion version = selection.current();
        return invoke(() -> runtime.accept(
                Cgf2b32HarnessFacts.ACCESS_TOKEN,
                new ModelInvocationRuntime.AcceptCommand(
                        request.clientRequestId(),
                        request.requestId(),
                        Cgf2b32HarnessFacts.requestDigest(
                                version,
                                runIdentity.canary()),
                        Cgf2b32HarnessFacts.MODEL_ID,
                        Cgf2b32HarnessFacts.modelRevision(version),
                        Cgf2b32HarnessFacts.configurationRevision(version),
                        Cgf2b32HarnessFacts.registryGeneration(version),
                        "development_synthetic",
                        Cgf2b32HarnessFacts.ADMISSION_DIGEST,
                        Instant.now().plusSeconds(120),
                        10_000)));
    }

    OperationView execute(InvocationCommand command) {
        return invoke(() -> runtime.execute(command.invocationId(), nodeId));
    }

    OperationView recover(InvocationCommand command) {
        return invoke(() -> runtime.recover(command.invocationId(), nodeId));
    }

    OperationView cancel(CancelCommand command) {
        return invoke(() -> runtime.requestCancel(
                Cgf2b32HarnessFacts.ACCESS_TOKEN,
                command.invocationId(),
                command.expectedStatusRevision(),
                "user_requested"));
    }

    OperationView status(UUID invocationId) {
        return invoke(() -> runtime.status(
                Cgf2b32HarnessFacts.ACCESS_TOKEN,
                invocationId));
    }

    String durableSse(UUID invocationId, long afterSequence) {
        activeSseSubscribers.incrementAndGet();
        try {
            List<ModelInvocationDurableEvent> events = runtime.durableEvents(
                    Cgf2b32HarnessFacts.ACCESS_TOKEN,
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

    SelectionView select(SelectionCommand command) {
        BindingVersion selected = selection.select(
                BindingVersion.valueOf(command.version()));
        return new SelectionView(selected.name());
    }

    Cgf2b32FailpointBackend.State configureFailpoint(
            Cgf2b32FailpointBackend.Command command) {
        return backend.configure(command);
    }

    Cgf2b32FailpointBackend.State awaitFailpointBlocked(UUID sessionId) {
        return backend.awaitBlocked(sessionId);
    }

    Cgf2b32FailpointBackend.State releaseFailpoint(UUID sessionId) {
        return backend.release(sessionId);
    }

    Cgf2b32FailpointBackend.State failpointState() {
        return backend.state();
    }

    EphemeralView ephemeral(UUID invocationId) {
        ModelInvocationEphemeralBuffer.Snapshot snapshot =
                ephemeral.snapshot(invocationId);
        return new EphemeralView(
                snapshot.events().size(),
                snapshot.lastSequence(),
                snapshot.droppedEvents(),
                snapshot.utf8Bytes());
    }

    NodeInfo nodeInfo() {
        return new NodeInfo(
                nodeId,
                ProcessHandle.current().pid(),
                selection.current().name());
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

    record AcceptRequest(UUID clientRequestId, UUID requestId) {}

    record InvocationCommand(UUID invocationId) {}

    record CancelCommand(UUID invocationId, long expectedStatusRevision) {}

    record SelectionCommand(String version) {}

    record SelectionView(String version) {}

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

    record EphemeralView(
            int eventCount,
            long lastSequence,
            long droppedEvents,
            int utf8Bytes) {}

    record NodeInfo(String nodeId, long processId, String selectedVersion) {}

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
