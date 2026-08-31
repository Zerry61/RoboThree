package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.domain.ModelInvocationRecoveryLease;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.domain.ProviderUsageFacts;
import com.robothree.central.modelgateway.domain.UsageAuthority;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider;
import com.robothree.central.modelgateway.port.ModelCredentialResolver;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import com.robothree.central.modelgateway.port.ModelEndpointValidator;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer.AuthorizedSubject;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import com.robothree.central.modelgateway.port.ModelInvocationCacheContextRepository;
import com.robothree.central.modelgateway.port.ModelInvocationEntropySource;
import com.robothree.central.modelgateway.port.ModelInvocationEventRepository;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.port.ModelInvocationRecoveryLeaseRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRepository;
import com.robothree.central.modelgateway.port.ModelUsageLedger;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public final class ModelInvocationRuntime implements ModelInvocationV1Alpha3Runtime {

    private static final Pattern NODE_ID =
            Pattern.compile("^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");

    private final ModelInvocationAccessAuthorizer accessAuthorizer;
    private final ModelEndpointBindingResolver bindingResolver;
    private final ModelBindingRuntimeStateProvider bindingStateProvider;
    private final ModelCredentialResolver credentialResolver;
    private final ModelEndpointValidator endpointValidator;
    private final ModelInvocationExecutionBackend backend;
    private final ModelInvocationRepository invocations;
    private final ModelInvocationEventRepository events;
    private final ModelInvocationRecoveryLeaseRepository leases;
    private final ModelInvocationAuditOutboxRepository outbox;
    private final ModelUsageLedger usageLedger;
    private final CentralTransactionRunner transactions;
    private final ModelInvocationRuntimePolicy policy;
    private final ModelInvocationAdmissionPolicy admissionPolicy;
    private final ModelInvocationEntropySource entropy;
    private final ModelInvocationEphemeralBuffer ephemeral;
    private final ModelInvocationCacheContextRepository cacheContexts;
    private final PromptCachePlanningService cachePlanning;
    private final Clock clock;

    public ModelInvocationRuntime(
            ModelInvocationAccessAuthorizer accessAuthorizer,
            ModelEndpointBindingResolver bindingResolver,
            ModelBindingRuntimeStateProvider bindingStateProvider,
            ModelCredentialResolver credentialResolver,
            ModelEndpointValidator endpointValidator,
            ModelInvocationExecutionBackend backend,
            ModelInvocationRepository invocations,
            ModelInvocationEventRepository events,
            ModelInvocationRecoveryLeaseRepository leases,
            ModelInvocationAuditOutboxRepository outbox,
            ModelUsageLedger usageLedger,
            CentralTransactionRunner transactions,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEntropySource entropy,
            ModelInvocationEphemeralBuffer ephemeral,
            Clock clock) {
        this(
                accessAuthorizer,
                bindingResolver,
                bindingStateProvider,
                credentialResolver,
                endpointValidator,
                backend,
                invocations,
                events,
                leases,
                outbox,
                usageLedger,
                transactions,
                policy,
                entropy,
                ephemeral,
                ModelInvocationAdmissionPolicy.development(),
                null,
                null,
                clock);
    }

    public ModelInvocationRuntime(
            ModelInvocationAccessAuthorizer accessAuthorizer,
            ModelEndpointBindingResolver bindingResolver,
            ModelBindingRuntimeStateProvider bindingStateProvider,
            ModelCredentialResolver credentialResolver,
            ModelEndpointValidator endpointValidator,
            ModelInvocationExecutionBackend backend,
            ModelInvocationRepository invocations,
            ModelInvocationEventRepository events,
            ModelInvocationRecoveryLeaseRepository leases,
            ModelInvocationAuditOutboxRepository outbox,
            ModelUsageLedger usageLedger,
            CentralTransactionRunner transactions,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEntropySource entropy,
            ModelInvocationEphemeralBuffer ephemeral,
            ModelInvocationAdmissionPolicy admissionPolicy,
            Clock clock) {
        this(
                accessAuthorizer,
                bindingResolver,
                bindingStateProvider,
                credentialResolver,
                endpointValidator,
                backend,
                invocations,
                events,
                leases,
                outbox,
                usageLedger,
                transactions,
                policy,
                entropy,
                ephemeral,
                admissionPolicy,
                null,
                null,
                clock);
    }

    public ModelInvocationRuntime(
            ModelInvocationAccessAuthorizer accessAuthorizer,
            ModelEndpointBindingResolver bindingResolver,
            ModelBindingRuntimeStateProvider bindingStateProvider,
            ModelCredentialResolver credentialResolver,
            ModelEndpointValidator endpointValidator,
            ModelInvocationExecutionBackend backend,
            ModelInvocationRepository invocations,
            ModelInvocationEventRepository events,
            ModelInvocationRecoveryLeaseRepository leases,
            ModelInvocationAuditOutboxRepository outbox,
            ModelUsageLedger usageLedger,
            CentralTransactionRunner transactions,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEntropySource entropy,
            ModelInvocationEphemeralBuffer ephemeral,
            ModelInvocationAdmissionPolicy admissionPolicy,
            ModelInvocationCacheContextRepository cacheContexts,
            PromptCachePlanningService cachePlanning,
            Clock clock) {
        this.accessAuthorizer = Objects.requireNonNull(
                accessAuthorizer,
                "accessAuthorizer");
        this.bindingResolver = Objects.requireNonNull(bindingResolver, "bindingResolver");
        this.bindingStateProvider = Objects.requireNonNull(
                bindingStateProvider,
                "bindingStateProvider");
        this.credentialResolver = Objects.requireNonNull(
                credentialResolver,
                "credentialResolver");
        this.endpointValidator = Objects.requireNonNull(
                endpointValidator,
                "endpointValidator");
        this.backend = Objects.requireNonNull(backend, "backend");
        this.invocations = Objects.requireNonNull(invocations, "invocations");
        this.events = Objects.requireNonNull(events, "events");
        this.leases = Objects.requireNonNull(leases, "leases");
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.usageLedger = Objects.requireNonNull(usageLedger, "usageLedger");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.admissionPolicy = Objects.requireNonNull(
                admissionPolicy,
                "admissionPolicy");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.ephemeral = Objects.requireNonNull(ephemeral, "ephemeral");
        this.cacheContexts = cacheContexts;
        this.cachePlanning = cachePlanning;
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ModelInvocation accept(
            String compactAccessToken,
            AcceptCommand command) {
        return acceptInternal(compactAccessToken, command, null, null);
    }

    public ModelInvocation acceptV1Alpha2(
            String compactAccessToken,
            AcceptCommand command,
            String sessionScopeDigest,
            String cacheContextDigest) {
        if (cacheContexts == null || cachePlanning == null) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.cache_planner_unavailable",
                    "The durable prompt cache planner is unavailable.");
        }
        return acceptInternal(
                compactAccessToken,
                command,
                sessionScopeDigest,
                cacheContextDigest);
    }

    private ModelInvocation acceptInternal(
            String compactAccessToken,
            AcceptCommand command,
            String sessionScopeDigest,
            String cacheContextDigest) {
        Objects.requireNonNull(command, "command");
        AuthorizedSubject subject =
                accessAuthorizer.authorizeModelUse(compactAccessToken);
        ModelInvocation.ClientRequestScope requestScope =
                new ModelInvocation.ClientRequestScope(
                        subject.enterpriseId(),
                        subject.userId(),
                        subject.deviceId(),
                        subject.clientInstanceId(),
                        command.clientRequestId());
        ModelInvocation existing =
                invocations.findByClientRequest(requestScope).orElse(null);
        if (existing != null) {
            if (existing.requestDigest().equals(command.requestDigest())
                    && cacheReplayMatches(
                            existing.invocationId(),
                            sessionScopeDigest,
                            cacheContextDigest)) {
                return existing;
            }
            throw ModelGatewayException.conflict(
                    "model_gateway.client_request_conflict",
                    "The client request is already bound to different data.");
        }
        validateAdmission(command);
        validateTimeouts(command);
        resolveForSelection(command.selection());

        Instant now = clock.instant();
        ModelInvocation proposed = new ModelInvocation(
                entropy.nextUuid(),
                subject.enterpriseId(),
                subject.userId(),
                subject.deviceId(),
                subject.clientInstanceId(),
                command.clientRequestId(),
                command.requestId(),
                command.requestDigest(),
                command.modelId(),
                command.modelRevision(),
                command.configurationRevision(),
                command.runtimeRegistryGeneration(),
                command.admissionType(),
                command.admissionDigest(),
                command.providerRequestDeadlineAt(),
                command.providerStreamIdleTimeoutMillis(),
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
                now,
                null,
                null,
                now);

        ModelInvocationCacheContext proposedContext = sessionScopeDigest == null
                ? null
                : ModelInvocationCacheContext.create(
                        proposed.invocationId(),
                        sessionScopeDigest,
                        cacheContextDigest,
                        now);

        try {
            return transactions.required(() -> {
                ModelInvocation stored = invocations.accept(proposed);
                if (proposedContext != null) {
                    cacheContexts.insertImmutable(stored.invocationId().equals(proposed.invocationId())
                            ? proposedContext
                            : ModelInvocationCacheContext.create(
                                    stored.invocationId(),
                                    sessionScopeDigest,
                                    cacheContextDigest,
                                    stored.createdAt()));
                }
                if (stored.lastDurableEventSequence() > 0) {
                    return stored;
                }
                if (!stored.invocationId().equals(proposed.invocationId())) {
                    return stored;
                }
                return appendAccepted(stored);
            });
        } catch (PersistenceConflictException conflict) {
            if (!"model_gateway.client_request_conflict".equals(conflict.code())) {
                throw conflict;
            }
            ModelInvocation concurrent = invocations.findByClientRequest(requestScope)
                    .orElseThrow(() -> conflict);
            if (concurrent.requestDigest().equals(command.requestDigest())
                    && cacheReplayMatches(
                            concurrent.invocationId(),
                            sessionScopeDigest,
                            cacheContextDigest)) {
                return concurrent;
            }
            throw conflict;
        }
    }

    private boolean cacheReplayMatches(
            UUID invocationId,
            String sessionScopeDigest,
            String cacheContextDigest) {
        if (sessionScopeDigest == null) {
            return cacheContexts == null
                    || cacheContexts.findContextByInvocationId(invocationId).isEmpty();
        }
        if (cacheContexts == null || cacheContextDigest == null) return false;
        return cacheContexts.findContextByInvocationId(invocationId)
                .map(context -> context.gatewayContractVersion().equals("v1alpha2")
                        && context.sessionScopeDigest().equals(sessionScopeDigest)
                        && context.cacheContextDigest().equals(cacheContextDigest))
                .orElse(false);
    }

    public ModelInvocation execute(UUID invocationId, String ownerNodeId) {
        requireNodeId(ownerNodeId);
        ModelInvocation current = requireInvocation(invocationId);
        if (current.status().isTerminal()) {
            return current;
        }
        if (current.status() != ModelInvocationStatus.ACCEPTED) {
            throw ModelGatewayException.conflict(
                    "model_gateway.recovery_required",
                    "The invocation requires the recovery path.");
        }
        LeaseClaim claim = claimLease(current.invocationId(), ownerNodeId);
        return dispatchAndExecute(current.invocationId(), claim);
    }

    public ModelInvocation recover(UUID invocationId, String ownerNodeId) {
        requireNodeId(ownerNodeId);
        ModelInvocation current = requireInvocation(invocationId);
        if (current.status().isTerminal()) {
            return current;
        }
        LeaseClaim claim = claimLease(invocationId, ownerNodeId);
        current = requireInvocation(invocationId);
        if (current.status() == ModelInvocationStatus.ACCEPTED) {
            return dispatchAndExecute(invocationId, claim);
        }
        if (current.status() != ModelInvocationStatus.RUNNING
                || current.dispatchDecision() == null) {
            throw ModelGatewayException.conflict(
                    "model_gateway.recovery_state_invalid",
                    "The invocation cannot be recovered from its current state.");
        }

        ResolvedBinding resolved = resolveDispatchDecision(
                ModelDispatchDecision.parse(
                        current.dispatchDecision()).decisionDigest());
        Request request = executionRequest(current, resolved, claim.fencingEpoch());
        Result result = switch (resolved.binding().recoveryMode()) {
            case IDEMPOTENT_RETRY ->
                    backend.execute(request, () -> isCancellationRequested(invocationId));
            case QUERY_THEN_RETRY -> recoverFromEvidence(
                    request,
                    backend.query(request),
                    invocationId);
            case MANUAL_RECONCILIATION -> Result.uncertain(
                    "model_gateway.manual_reconciliation_required",
                    "The provider outcome requires manual reconciliation.");
        };
        publishEphemeral(invocationId, result);
        return commitTerminal(invocationId, claim, result);
    }

    public ModelInvocation requestCancel(
            String compactAccessToken,
            UUID invocationId,
            long expectedStatusRevision,
            String reason) {
        AuthorizedSubject subject =
                accessAuthorizer.authorizeModelUse(compactAccessToken);
        if (!"user_requested".equals(reason)
                && !"task_cancelled".equals(reason)
                && !"deadline_exceeded".equals(reason)) {
            throw ModelGatewayException.validation(
                    "model_gateway.cancel_reason_invalid",
                    "The model cancellation reason is invalid.");
        }
        ModelInvocation updated = transactions.required(() -> {
            ModelInvocation current = requireOwnedInvocationForUpdate(
                    invocationId,
                    subject);
            if (current.status().isTerminal()) {
                return current;
            }
            if (current.statusRevision() != expectedStatusRevision) {
                throw ModelGatewayException.conflict(
                        "model_gateway.status_revision_conflict",
                        "The model invocation revision changed.");
            }
            if (current.cancelRequestedAt() != null) {
                if (current.cancelReason().equals(reason)) {
                    return current;
                }
                throw ModelGatewayException.conflict(
                        "model_gateway.cancel_conflict",
                        "The model invocation already has a different cancel intent.");
            }
            Instant now = clock.instant();
            if (current.status() == ModelInvocationStatus.ACCEPTED) {
                return appendTerminalWithoutDispatch(
                        current,
                        new Result(
                                ModelInvocationExecution.Outcome.CANCELLED,
                                null,
                                null,
                                null,
                                null,
                                List.of()),
                        now,
                        reason);
            }
            ModelInvocation withIntent = copy(
                    current,
                    current.status(),
                    current.statusRevision() + 1,
                    current.lastDurableEventSequence(),
                    current.durableEventStreamDigest(),
                    current.dispatchDecision(),
                    now,
                    reason,
                    current.timeoutIntentAt(),
                    current.usageJson(),
                    current.finishReason(),
                    current.safeErrorCode(),
                    current.safeSummary(),
                    current.startedAt(),
                    current.endedAt(),
                    now);
            return invocations.update(withIntent, current.statusRevision());
        });
        if (!updated.status().isTerminal()) {
            backend.requestCancel(invocationId);
        }
        return updated;
    }

    public ModelInvocation status(
            String compactAccessToken,
            UUID invocationId) {
        AuthorizedSubject subject =
                accessAuthorizer.authorizeModelUse(compactAccessToken);
        ModelInvocation invocation = requireInvocation(invocationId);
        requireOwnership(invocation, subject);
        return invocation;
    }

    public List<ModelInvocationDurableEvent> durableEvents(
            String compactAccessToken,
            UUID invocationId,
            long afterSequence,
            int limit) {
        status(compactAccessToken, invocationId);
        return events.findAfter(invocationId, afterSequence, limit);
    }

    public ModelInvocationEphemeralBuffer.Snapshot ephemeralSnapshot(
            String compactAccessToken,
            UUID invocationId) {
        status(compactAccessToken, invocationId);
        return ephemeral.snapshot(invocationId);
    }

    public ModelInvocationRecoveryLease renewLease(
            UUID invocationId,
            String ownerNodeId,
            long fencingEpoch) {
        requireNodeId(ownerNodeId);
        return transactions.required(() -> {
            ModelInvocation invocation = requireInvocationForUpdate(invocationId);
            if (invocation.status().isTerminal()) {
                throw ModelGatewayException.conflict(
                        "model_gateway.lease_terminal",
                        "A terminal invocation cannot renew its recovery lease.");
            }
            Instant databaseNow = leases.currentDatabaseTime();
            ModelInvocationRecoveryLease current = leases
                    .findForUpdate(invocationId)
                    .orElseThrow(() -> ModelGatewayException.conflict(
                            "model_gateway.lease_missing",
                            "The model invocation lease is missing."));
            requireFence(current, ownerNodeId, fencingEpoch, databaseNow, false);
            ModelInvocationRecoveryLease renewed = new ModelInvocationRecoveryLease(
                    invocationId,
                    ownerNodeId,
                    fencingEpoch,
                    invocation.statusRevision(),
                    databaseNow.plus(policy.leaseTtl()),
                    databaseNow,
                    current.recoveryAttempt(),
                    policy.policyRevision(),
                    databaseNow);
            return leases.replace(renewed, fencingEpoch);
        });
    }

    private ModelInvocation dispatchAndExecute(
            UUID invocationId,
            LeaseClaim claim) {
        Dispatch dispatch = transactions.required(() -> {
            ModelInvocation current = requireInvocationForUpdate(invocationId);
            if (current.status().isTerminal()) {
                return new Dispatch(current, null, null);
            }
            if (current.status() != ModelInvocationStatus.ACCEPTED) {
                throw ModelGatewayException.conflict(
                        "model_gateway.dispatch_state_invalid",
                        "The invocation cannot be dispatched from its current state.");
            }
            Instant now = clock.instant();
            requireLeaseForCommit(current, claim);
            if (!now.isBefore(current.providerRequestDeadlineAt())) {
                ModelInvocation timedOut = appendTerminalWithoutDispatch(
                        current,
                        new Result(
                                ModelInvocationExecution.Outcome.TIMED_OUT,
                                null,
                                null,
                                null,
                                null,
                                List.of()),
                        now,
                        "deadline_exceeded");
                return new Dispatch(timedOut, null, null);
            }
            ResolvedBinding resolved = resolveForSelection(selectionOf(current));
            ModelDispatchDecision decision =
                    ModelDispatchDecision.fromBinding(resolved.binding());
            if (cachePlanning != null) {
                cachePlanning.prepareNewPlan(current, resolved.binding());
            }
            ModelInvocation running = appendTransition(
                    current,
                    ModelInvocationStatus.RUNNING,
                    "dispatch_decided",
                    decision.persistedValue(),
                    null,
                    null,
                    null,
                    null,
                    now,
                    null,
                    now);
            updateLeaseStatus(running, claim, now);
            return new Dispatch(
                    running,
                    executionRequest(running, resolved, claim.fencingEpoch()),
                    claim);
        });
        if (dispatch.request() == null) {
            return dispatch.invocation();
        }

        Result result;
        try {
            result = backend.execute(
                    dispatch.request(),
                    () -> isCancellationRequested(invocationId));
        } catch (RuntimeException exception) {
            result = Result.uncertain(
                    "model_gateway.dispatch_outcome_unknown",
                    "The provider outcome could not be confirmed.");
        }
        publishEphemeral(invocationId, result);
        return commitTerminal(invocationId, dispatch.claim(), result);
    }

    private Result recoverFromEvidence(
            Request request,
            RecoveryEvidence evidence,
            UUID invocationId) {
        return switch (evidence.type()) {
            case TERMINAL -> evidence.result();
            case NOT_FOUND ->
                    backend.execute(
                            request,
                            () -> isCancellationRequested(invocationId));
            case UNKNOWN -> Result.uncertain(
                    "model_gateway.provider_outcome_unknown",
                    "The provider outcome could not be confirmed.");
        };
    }

    private ModelInvocation commitTerminal(
            UUID invocationId,
            LeaseClaim claim,
            Result result) {
        TerminalCommit commit = transactions.required(() -> {
            ModelInvocation current = requireInvocationForUpdate(invocationId);
            if (current.status().isTerminal()) {
                recordSupersededUsage(current, claim, result);
                ModelInvocationRecoveryLease lease = leases
                        .findForUpdate(invocationId)
                        .orElseThrow(() -> ModelGatewayException.conflict(
                                "model_gateway.lease_missing",
                                "The model invocation lease is missing."));
                boolean staleOwner = !lease.ownerNodeId().equals(claim.ownerNodeId())
                        || lease.fencingEpoch() != claim.fencingEpoch();
                return new TerminalCommit(current, staleOwner);
            }
            requireLeaseForCommit(current, claim);
            if (current.status() != ModelInvocationStatus.RUNNING) {
                throw ModelGatewayException.conflict(
                        "model_gateway.terminal_state_invalid",
                        "The invocation cannot enter a terminal state.");
            }
            Instant now = clock.instant();
            ModelInvocation terminal = appendTerminalWithLease(
                    current,
                    claim,
                    result,
                    now);
            updateLeaseStatus(terminal, claim, now);
            return new TerminalCommit(terminal, false);
        });
        if (commit.staleOwner()) {
            throw ModelGatewayException.conflict(
                    "model_gateway.fencing_epoch_conflict",
                    "The recovery owner fencing epoch changed.");
        }
        return commit.invocation();
    }

    private ModelInvocation appendAccepted(ModelInvocation accepted) {
        String metadata = "{\"status\":\"accepted\",\"statusRevision\":0}";
        EventAppend append = createEvent(
                accepted,
                accepted.lastDurableEventSequence() + 1,
                "accepted",
                ModelInvocationStatus.ACCEPTED,
                accepted.statusRevision(),
                metadata);
        events.append(append.event());
        outbox.insert(createOutbox(accepted.invocationId(), append.event()));
        ModelInvocation updated = copy(
                accepted,
                accepted.status(),
                accepted.statusRevision(),
                append.event().eventSequence(),
                append.streamDigest(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                accepted.updatedAt());
        return invocations.update(updated, accepted.statusRevision());
    }

    private ModelInvocation appendTransition(
            ModelInvocation current,
            ModelInvocationStatus status,
            String eventType,
            String dispatchDecision,
            String usageJson,
            String finishReason,
            String safeErrorCode,
            String safeSummary,
            Instant startedAt,
            Instant endedAt,
            Instant updatedAt) {
        long nextRevision = current.statusRevision() + 1;
        String metadata = "{\"status\":\""
                + status.contractValue()
                + "\",\"statusRevision\":"
                + nextRevision
                + "}";
        EventAppend append = createEvent(
                current,
                current.lastDurableEventSequence() + 1,
                eventType,
                status,
                nextRevision,
                metadata);
        events.append(append.event());
        outbox.insert(createOutbox(current.invocationId(), append.event()));
        ModelInvocation updated = copy(
                current,
                status,
                nextRevision,
                append.event().eventSequence(),
                append.streamDigest(),
                dispatchDecision,
                current.cancelRequestedAt(),
                current.cancelReason(),
                current.timeoutIntentAt(),
                usageJson,
                finishReason,
                safeErrorCode,
                safeSummary,
                startedAt,
                endedAt,
                updatedAt);
        return invocations.update(updated, current.statusRevision());
    }

    private ModelInvocation appendTerminalWithLease(
            ModelInvocation current,
            LeaseClaim claim,
            Result result,
            Instant now) {
        long nextRevision = current.statusRevision() + 1;
        long sequence = current.lastDurableEventSequence();
        String streamDigest = current.durableEventStreamDigest();
        String usageJson = null;
        if (result.usage() != null) {
            ProviderUsageFact usageFact = usageFact(
                    current,
                    claim,
                    result.usage(),
                    ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER,
                    now);
            usageLedger.insert(usageFact);
            usageJson = usageJson(result.usage());
            EventAppend usage = createEvent(
                    current,
                    sequence + 1,
                    "usage_recorded",
                    statusOf(result),
                    nextRevision,
                    usageJson,
                    streamDigest);
            events.append(usage.event());
            outbox.insert(createOutbox(current.invocationId(), usage.event()));
            sequence = usage.event().eventSequence();
            streamDigest = usage.streamDigest();
        }

        ModelInvocationStatus terminalStatus = statusOf(result);
        String terminalMetadata = "{\"status\":\""
                + terminalStatus.contractValue()
                + "\",\"statusRevision\":"
                + nextRevision
                + "}";
        EventAppend terminal = createEvent(
                current,
                sequence + 1,
                terminalStatus.contractValue(),
                terminalStatus,
                nextRevision,
                terminalMetadata,
                streamDigest);
        events.append(terminal.event());
        outbox.insert(createOutbox(current.invocationId(), terminal.event()));
        ModelInvocation updated = copy(
                current,
                terminalStatus,
                nextRevision,
                terminal.event().eventSequence(),
                terminal.streamDigest(),
                current.dispatchDecision(),
                current.cancelRequestedAt(),
                current.cancelReason(),
                terminalStatus == ModelInvocationStatus.TIMED_OUT
                        ? now
                        : current.timeoutIntentAt(),
                usageJson,
                result.finishReason(),
                result.safeErrorCode(),
                result.safeSummary(),
                current.startedAt(),
                now,
                now);
        return invocations.update(updated, current.statusRevision());
    }

    private ModelInvocation appendTerminalWithoutDispatch(
            ModelInvocation current,
            Result result,
            Instant now,
            String reason) {
        ModelInvocationStatus status = statusOf(result);
        long nextRevision = current.statusRevision() + 1;
        String metadata = "{\"status\":\""
                + status.contractValue()
                + "\",\"statusRevision\":"
                + nextRevision
                + "}";
        EventAppend append = createEvent(
                current,
                current.lastDurableEventSequence() + 1,
                status.contractValue(),
                status,
                nextRevision,
                metadata);
        events.append(append.event());
        outbox.insert(createOutbox(current.invocationId(), append.event()));
        ModelInvocation updated = copy(
                current,
                status,
                nextRevision,
                append.event().eventSequence(),
                append.streamDigest(),
                current.dispatchDecision(),
                status == ModelInvocationStatus.CANCELLED ? now : current.cancelRequestedAt(),
                status == ModelInvocationStatus.CANCELLED ? reason : current.cancelReason(),
                status == ModelInvocationStatus.TIMED_OUT ? now : current.timeoutIntentAt(),
                null,
                null,
                result.safeErrorCode(),
                result.safeSummary(),
                current.startedAt(),
                now,
                now);
        return invocations.update(updated, current.statusRevision());
    }

    private LeaseClaim claimLease(UUID invocationId, String ownerNodeId) {
        return transactions.required(() -> {
            ModelInvocation invocation = requireInvocationForUpdate(invocationId);
            if (invocation.status().isTerminal()) {
                throw ModelGatewayException.conflict(
                        "model_gateway.lease_terminal",
                        "A terminal invocation cannot acquire a recovery lease.");
            }
            Instant databaseNow = leases.currentDatabaseTime();
            ModelInvocationRecoveryLease existing =
                    leases.findForUpdate(invocationId).orElse(null);
            if (existing == null) {
                ModelInvocationRecoveryLease created =
                        new ModelInvocationRecoveryLease(
                                invocationId,
                                ownerNodeId,
                                1,
                                invocation.statusRevision(),
                                databaseNow.plus(policy.leaseTtl()),
                                databaseNow,
                                1,
                                policy.policyRevision(),
                                databaseNow);
                leases.insert(created);
                return registerAttempt(invocation, new LeaseClaim(ownerNodeId, 1), databaseNow);
            }
            if (existing.ownerNodeId().equals(ownerNodeId)
                    && databaseNow.isBefore(existing.leaseExpiresAt())) {
                return registerAttempt(
                        invocation,
                        new LeaseClaim(ownerNodeId, existing.fencingEpoch()),
                        databaseNow);
            }
            if (databaseNow.isBefore(existing.leaseExpiresAt())) {
                throw ModelGatewayException.conflict(
                        "model_gateway.lease_not_expired",
                        "The invocation recovery lease is owned by another node.");
            }
            ModelInvocationRecoveryLease takeover =
                    new ModelInvocationRecoveryLease(
                            invocationId,
                            ownerNodeId,
                            existing.fencingEpoch() + 1,
                            invocation.statusRevision(),
                            databaseNow.plus(policy.leaseTtl()),
                            databaseNow,
                            existing.recoveryAttempt() + 1,
                            policy.policyRevision(),
                            databaseNow);
            leases.replace(takeover, existing.fencingEpoch());
            return registerAttempt(
                    invocation,
                    new LeaseClaim(ownerNodeId, takeover.fencingEpoch()),
                    databaseNow);
        });
    }

    private LeaseClaim registerAttempt(
            ModelInvocation invocation,
            LeaseClaim claim,
            Instant registeredAt) {
        String attemptKey = ProviderUsageFacts.attemptKey(
                UsageAuthority.CENTRAL_ENTERPRISE,
                invocation.invocationId(),
                claim.fencingEpoch());
        ModelProviderAttempt.AttemptIdentity identity =
                new ModelProviderAttempt.AttemptIdentity(
                        UsageAuthority.CENTRAL_ENTERPRISE,
                        invocation.invocationId(),
                        attemptKey);
        if (usageLedger.findAttempt(identity).isEmpty()) {
            usageLedger.register(new ModelProviderAttempt(
                    UsageAuthority.CENTRAL_ENTERPRISE,
                    invocation.invocationId(),
                    attemptKey,
                    claim.fencingEpoch(),
                    registeredAt));
        }
        return claim;
    }

    private void recordSupersededUsage(
            ModelInvocation current,
            LeaseClaim claim,
            Result result) {
        if (result.usage() == null) {
            return;
        }
        String attemptKey = ProviderUsageFacts.attemptKey(
                UsageAuthority.CENTRAL_ENTERPRISE,
                current.invocationId(),
                claim.fencingEpoch());
        ModelProviderAttempt.AttemptIdentity identity =
                new ModelProviderAttempt.AttemptIdentity(
                        UsageAuthority.CENTRAL_ENTERPRISE,
                        current.invocationId(),
                        attemptKey);
        if (usageLedger.findUsageFact(identity).isPresent()) {
            return;
        }
        ProviderUsageFact fact = usageFact(
                current,
                claim,
                result.usage(),
                ProviderUsageFact.AttemptDisposition.SUPERSEDED_CONFIRMED,
                clock.instant());
        usageLedger.insert(fact);
        outbox.insert(new ModelInvocationAuditOutbox(
                entropy.nextUuid(),
                current.invocationId(),
                fact.usageFactId(),
                "model_invocation_usage_superseded_confirmed",
                fact.usageDigest(),
                fact.recordedAt(),
                null,
                0));
    }

    private ProviderUsageFact usageFact(
            ModelInvocation invocation,
            LeaseClaim claim,
            ModelInvocationExecution.Usage usage,
            ProviderUsageFact.AttemptDisposition disposition,
            Instant recordedAt) {
        ModelEndpointBinding binding = bindingResolver.resolveDispatchDecision(
                ModelDispatchDecision.parse(
                        invocation.dispatchDecision()).decisionDigest());
        return ProviderUsageFacts.create(
                entropy.nextUuid(),
                UsageAuthority.CENTRAL_ENTERPRISE,
                invocation.invocationId(),
                claim.fencingEpoch(),
                binding.protocol(),
                usage,
                disposition,
                recordedAt);
    }

    private void requireLeaseForCommit(
            ModelInvocation invocation,
            LeaseClaim claim) {
        Instant databaseNow = leases.currentDatabaseTime();
        ModelInvocationRecoveryLease lease = leases
                .findForUpdate(invocation.invocationId())
                .orElseThrow(() -> ModelGatewayException.conflict(
                        "model_gateway.lease_missing",
                        "The model invocation lease is missing."));
        requireFence(
                lease,
                claim.ownerNodeId(),
                claim.fencingEpoch(),
                databaseNow,
                true);
    }

    private void requireFence(
            ModelInvocationRecoveryLease lease,
            String ownerNodeId,
            long fencingEpoch,
            Instant databaseNow,
            boolean requireUnexpired) {
        if (!lease.ownerNodeId().equals(ownerNodeId)
                || lease.fencingEpoch() != fencingEpoch) {
            throw ModelGatewayException.conflict(
                    "model_gateway.fencing_epoch_conflict",
                    "The recovery owner fencing epoch changed.");
        }
        if (requireUnexpired && !databaseNow.isBefore(lease.leaseExpiresAt())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.lease_expired",
                    "The model invocation recovery lease expired.");
        }
    }

    private void updateLeaseStatus(
            ModelInvocation invocation,
            LeaseClaim claim,
            Instant now) {
        ModelInvocationRecoveryLease current = leases
                .findForUpdate(invocation.invocationId())
                .orElseThrow(() -> ModelGatewayException.conflict(
                        "model_gateway.lease_missing",
                        "The model invocation lease is missing."));
        requireFence(
                current,
                claim.ownerNodeId(),
                claim.fencingEpoch(),
                leases.currentDatabaseTime(),
                false);
        ModelInvocationRecoveryLease updated =
                new ModelInvocationRecoveryLease(
                        current.invocationId(),
                        current.ownerNodeId(),
                        current.fencingEpoch(),
                        invocation.statusRevision(),
                        current.leaseExpiresAt(),
                        current.databaseObservedAt(),
                        current.recoveryAttempt(),
                        current.policyRevision(),
                        now);
        leases.replace(updated, claim.fencingEpoch());
    }

    private ResolvedBinding resolveForSelection(
            ModelEndpointBinding.Selection selection) {
        return validateBinding(bindingResolver.resolveForSelection(selection));
    }

    private ResolvedBinding resolveDispatchDecision(String decisionDigest) {
        return validateBinding(
                bindingResolver.resolveDispatchDecision(decisionDigest));
    }

    private ResolvedBinding validateBinding(ModelEndpointBinding binding) {
        endpointValidator.validate(binding);
        ModelBindingRuntimeStateProvider.RuntimeState state =
                bindingStateProvider.resolve(binding.reference());
        if (!state.enabled()) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.binding_disabled",
                    "The model binding is disabled.");
        }
        if (state.revoked()) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.binding_revoked",
                    "The model binding is revoked.");
        }
        if (!state.healthy()) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.binding_unhealthy",
                    "The model binding is unhealthy.");
        }
        CredentialResolution credential = credentialResolver.resolve(
                binding.credentialReference(),
                binding.credentialRevision());
        return new ResolvedBinding(binding, credential);
    }

    private Request executionRequest(
            ModelInvocation invocation,
            ResolvedBinding resolved,
            long fencingEpoch) {
        return new Request(
                invocation.invocationId(),
                invocation.requestDigest(),
                invocation.modelId(),
                resolved.binding(),
                resolved.credential(),
                fencingEpoch,
                invocation.providerRequestDeadlineAt(),
                Duration.ofMillis(invocation.providerStreamIdleTimeoutMillis()),
                cachePlanning == null
                        ? null
                        : cachePlanning.resolveForExecution(invocation.invocationId())
                                .map(ModelInvocationExecution.PromptCacheExecutionContext::from)
                                .orElse(null));
    }

    private void publishEphemeral(UUID invocationId, Result result) {
        for (String delta : result.ephemeralTextDeltas()) {
            ephemeral.appendText(invocationId, delta, clock.instant());
        }
    }

    private boolean isCancellationRequested(UUID invocationId) {
        return invocations.findById(invocationId)
                .map(value -> value.cancelRequestedAt() != null)
                .orElse(true);
    }

    private void validateAdmission(AcceptCommand command) {
        admissionPolicy.validate(command.admissionType());
    }

    private void validateTimeouts(AcceptCommand command) {
        Instant now = clock.instant();
        if (command.providerRequestDeadlineAt().isBefore(now)
                || command.providerRequestDeadlineAt()
                        .isAfter(now.plus(policy.maximumProviderRequestDuration()))) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_deadline_invalid",
                    "The provider request deadline is outside the allowed range.");
        }
        if (command.providerStreamIdleTimeoutMillis()
                > policy.maximumProviderStreamIdle().toMillis()) {
            throw ModelGatewayException.validation(
                    "model_gateway.stream_idle_timeout_invalid",
                    "The provider stream idle timeout exceeds the allowed range.");
        }
    }

    private ModelInvocation requireInvocation(UUID invocationId) {
        return invocations.findById(invocationId)
                .orElseThrow(() -> ModelGatewayException.validation(
                        "model_gateway.invocation_missing",
                        "The model invocation does not exist."));
    }

    private ModelInvocation requireInvocationForUpdate(UUID invocationId) {
        return invocations.findByIdForUpdate(invocationId)
                .orElseThrow(() -> ModelGatewayException.validation(
                        "model_gateway.invocation_missing",
                        "The model invocation does not exist."));
    }

    private ModelInvocation requireOwnedInvocationForUpdate(
            UUID invocationId,
            AuthorizedSubject subject) {
        ModelInvocation invocation = requireInvocationForUpdate(invocationId);
        requireOwnership(invocation, subject);
        return invocation;
    }

    private void requireOwnership(
            ModelInvocation invocation,
            AuthorizedSubject subject) {
        if (!invocation.enterpriseId().equals(subject.enterpriseId())
                || !invocation.userId().equals(subject.userId())
                || !invocation.deviceId().equals(subject.deviceId())
                || !invocation.clientInstanceId().equals(subject.clientInstanceId())) {
            throw ModelGatewayException.validation(
                    "model_gateway.invocation_not_found",
                    "The model invocation does not exist.");
        }
    }

    private static ModelEndpointBinding.Selection selectionOf(
            ModelInvocation invocation) {
        return new ModelEndpointBinding.Selection(
                invocation.modelId(),
                invocation.modelRevision(),
                invocation.configurationRevision(),
                invocation.runtimeRegistryGeneration());
    }

    private EventAppend createEvent(
            ModelInvocation invocation,
            long sequence,
            String eventType,
            ModelInvocationStatus status,
            long statusRevision,
            String metadataJson) {
        return createEvent(
                invocation,
                sequence,
                eventType,
                status,
                statusRevision,
                metadataJson,
                invocation.durableEventStreamDigest());
    }

    private EventAppend createEvent(
            ModelInvocation invocation,
            long sequence,
            String eventType,
            ModelInvocationStatus status,
            long statusRevision,
            String metadataJson,
            String previousStreamDigest) {
        String eventDigest = CanonicalJson.sha256(
                bound(
                        invocation.invocationId().toString(),
                        Long.toString(sequence),
                        eventType,
                        status.contractValue(),
                        Long.toString(statusRevision),
                        metadataJson));
        String streamDigest = CanonicalJson.sha256(
                bound(
                        previousStreamDigest == null ? "root" : previousStreamDigest,
                        eventDigest));
        return new EventAppend(
                new ModelInvocationDurableEvent(
                        invocation.invocationId(),
                        sequence,
                        entropy.nextUuid(),
                        eventType,
                        status,
                        statusRevision,
                        eventDigest,
                        streamDigest,
                        metadataJson,
                        clock.instant()),
                streamDigest);
    }

    private ModelInvocationAuditOutbox createOutbox(
            UUID invocationId,
            ModelInvocationDurableEvent event) {
        return new ModelInvocationAuditOutbox(
                entropy.nextUuid(),
                invocationId,
                event.eventId(),
                "model_invocation_" + event.eventType(),
                event.eventDigest(),
                event.createdAt(),
                null,
                0);
    }

    private static ModelInvocationStatus statusOf(Result result) {
        return switch (result.outcome()) {
            case COMPLETED -> ModelInvocationStatus.COMPLETED;
            case FAILED -> ModelInvocationStatus.FAILED;
            case CANCELLED -> ModelInvocationStatus.CANCELLED;
            case TIMED_OUT -> ModelInvocationStatus.TIMED_OUT;
            case UNCERTAIN -> ModelInvocationStatus.UNCERTAIN;
        };
    }

    private static String usageJson(ModelInvocationExecution.Usage usage) {
        return "{\"inputTokens\":"
                + usage.inputTokens()
                + ",\"outputTokens\":"
                + usage.outputTokens()
                + "}";
    }

    private static String bound(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            String actual = value == null ? "" : value;
            input.append(actual.length()).append(':').append(actual).append('|');
        }
        return input.toString();
    }

    private static void requireNodeId(String ownerNodeId) {
        if (ownerNodeId == null || !NODE_ID.matcher(ownerNodeId).matches()) {
            throw ModelGatewayException.validation(
                    "model_gateway.node_id_invalid",
                    "The model runtime node identifier is invalid.");
        }
    }

    private static ModelInvocation copy(
            ModelInvocation source,
            ModelInvocationStatus status,
            long statusRevision,
            long eventSequence,
            String streamDigest,
            String dispatchDecision,
            Instant cancelRequestedAt,
            String cancelReason,
            Instant timeoutIntentAt,
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
                eventSequence,
                streamDigest,
                dispatchDecision,
                cancelRequestedAt,
                cancelReason,
                timeoutIntentAt,
                usageJson,
                finishReason,
                safeErrorCode,
                safeSummary,
                source.createdAt(),
                startedAt,
                endedAt,
                updatedAt);
    }

    public record AcceptCommand(
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
            long providerStreamIdleTimeoutMillis) {

        public AcceptCommand {
            Objects.requireNonNull(clientRequestId, "clientRequestId");
            Objects.requireNonNull(requestId, "requestId");
            new ModelEndpointBinding.Selection(
                    modelId,
                    modelRevision,
                    configurationRevision,
                    runtimeRegistryGeneration);
            if (requestDigest == null || !requestDigest.matches("^[a-f0-9]{64}$")) {
                throw new IllegalArgumentException("requestDigest must be SHA-256");
            }
            if (admissionType == null || admissionType.isBlank()) {
                throw new IllegalArgumentException("admissionType is required");
            }
            if (admissionDigest == null
                    || !admissionDigest.matches("^[a-f0-9]{64}$")) {
                throw new IllegalArgumentException("admissionDigest must be SHA-256");
            }
            Objects.requireNonNull(
                    providerRequestDeadlineAt,
                    "providerRequestDeadlineAt");
        }

        ModelEndpointBinding.Selection selection() {
            return new ModelEndpointBinding.Selection(
                    modelId,
                    modelRevision,
                    configurationRevision,
                    runtimeRegistryGeneration);
        }
    }

    private record ResolvedBinding(
            ModelEndpointBinding binding,
            CredentialResolution credential) {}

    private record LeaseClaim(String ownerNodeId, long fencingEpoch) {}

    private record TerminalCommit(ModelInvocation invocation, boolean staleOwner) {}

    private record Dispatch(
            ModelInvocation invocation,
            Request request,
            LeaseClaim claim) {}

    private record EventAppend(
            ModelInvocationDurableEvent event,
            String streamDigest) {}
}
