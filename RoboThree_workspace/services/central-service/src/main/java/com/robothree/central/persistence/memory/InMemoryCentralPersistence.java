package com.robothree.central.persistence.memory;

import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceValidator;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.configuration.port.PackageDocumentRepository;
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
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

public final class InMemoryCentralPersistence implements
        VerifiedIdentityRepository,
        EnterprisePermissionRepository,
        EnterpriseDeviceRepository,
        DeviceEnrollmentGrantRepository,
        DeviceChallengeRepository,
        AccessTokenIssuanceRepository,
        EnterpriseSessionPersistence,
        ConfigurationSnapshotRepository,
        PackageDocumentRepository,
        ModelInvocationRepository,
        ModelInvocationEventRepository,
        ModelInvocationRecoveryLeaseRepository,
        ModelInvocationAuditOutboxRepository,
        ModelInvocationCacheContextRepository,
        PromptCachePlanRepository,
        ModelUsageLedger,
        CentralTransactionRunner {

    private final Clock databaseClock;
    private Map<UUID, VerifiedEnterpriseIdentity> identities = new HashMap<>();
    private Map<PermissionKey, EnterpriseUserPermission> permissions = new HashMap<>();
    private Map<String, EnterpriseDevice> devices = new HashMap<>();
    private Map<DeviceKey, String> deviceKeyIndex = new HashMap<>();
    private Map<DevicePublicKey, String> devicePublicKeyIndex = new HashMap<>();
    private Map<UUID, DeviceEnrollmentGrant> enrollmentGrants = new HashMap<>();
    private Map<String, UUID> enrollmentCodeIndex = new HashMap<>();
    private Map<UUID, DeviceChallenge> challenges = new HashMap<>();
    private Map<UUID, AccessTokenIssuance> tokenIssuances = new HashMap<>();
    private Map<UUID, EnterpriseSessionChallengeBinding> enterpriseSessionBindings =
            new HashMap<>();
    private Map<UUID, UUID> enterpriseSessionCorrelationIndex = new HashMap<>();
    private Map<String, UUID> enterpriseSessionBindingDigestIndex = new HashMap<>();
    private Map<UUID, EnterpriseSessionLeaseIssuance> enterpriseSessionLeases =
            new HashMap<>();
    private Map<String, UUID> enterpriseSessionTokenDigestIndex = new HashMap<>();
    private Map<UUID, UUID> enterpriseSessionChallengeLeaseIndex = new HashMap<>();
    private Map<RevisionKey, ImmutableConfigurationSnapshot> snapshots = new HashMap<>();
    private Map<RevisionKey, ImmutablePackageDocument> packages = new HashMap<>();
    private Map<UUID, ModelInvocation> modelInvocations = new HashMap<>();
    private Map<ModelInvocation.ClientRequestScope, UUID> modelInvocationRequestIndex =
            new HashMap<>();
    private Map<EventKey, ModelInvocationDurableEvent> modelInvocationEvents =
            new HashMap<>();
    private Map<UUID, ModelInvocationRecoveryLease> modelInvocationLeases =
            new HashMap<>();
    private Map<UUID, ModelInvocationAuditOutbox> modelInvocationAuditOutbox =
            new HashMap<>();
    private Map<ModelProviderAttempt.AttemptIdentity, ModelProviderAttempt>
            modelProviderAttempts = new HashMap<>();
    private Map<ModelProviderAttempt.AttemptIdentity, ProviderUsageFact>
            providerUsageFacts = new HashMap<>();
    private Map<UUID, ModelInvocationCacheContext> modelInvocationCacheContexts =
            new HashMap<>();
    private Map<UUID, PromptCachePlan> promptCachePlans = new HashMap<>();

    public InMemoryCentralPersistence() {
        this(Clock.systemUTC());
    }

    public InMemoryCentralPersistence(Clock databaseClock) {
        this.databaseClock = java.util.Objects.requireNonNull(
                databaseClock,
                "databaseClock");
    }

    @Override
    public synchronized VerifiedEnterpriseIdentity insert(VerifiedEnterpriseIdentity identity) {
        return insertImmutable(
                identities,
                identity.verifiedIdentityId(),
                identity,
                "persistence.identity_conflict");
    }

    @Override
    public synchronized Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityById(
            UUID verifiedIdentityId) {
        return Optional.ofNullable(identities.get(verifiedIdentityId));
    }

    @Override
    public synchronized Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityByIdForUpdate(
            UUID verifiedIdentityId) {
        return findVerifiedIdentityById(verifiedIdentityId);
    }

    @Override
    public synchronized VerifiedEnterpriseIdentity disable(
            UUID verifiedIdentityId,
            java.time.Instant disabledAt) {
        VerifiedEnterpriseIdentity current = identities.get(verifiedIdentityId);
        if (current == null) {
            throw integrity("persistence.identity_missing", "verified identity does not exist");
        }
        if (current.disabledAt() != null) {
            return current;
        }
        VerifiedEnterpriseIdentity disabled = new VerifiedEnterpriseIdentity(
                current.verifiedIdentityId(),
                current.enterpriseId(),
                current.userId(),
                current.provider(),
                current.providerSubjectDigest(),
                current.identityDigest(),
                current.issuedAt(),
                current.expiresAt(),
                disabledAt);
        identities.put(verifiedIdentityId, disabled);
        return disabled;
    }

    @Override
    public synchronized EnterpriseUserPermission save(EnterpriseUserPermission permission) {
        PermissionKey key = new PermissionKey(
                permission.enterpriseId(),
                permission.userId(),
                permission.permission());
        EnterpriseUserPermission current = permissions.get(key);
        if (current != null && permission.revision() < current.revision()) {
            throw conflict("persistence.permission_stale", "permission revision is stale");
        }
        if (current != null && permission.revision() == current.revision() && !current.equals(permission)) {
            throw conflict("persistence.permission_conflict", "permission revision digest drift");
        }
        permissions.put(key, permission);
        return permission;
    }

    @Override
    public synchronized Optional<EnterpriseUserPermission> find(
            String enterpriseId,
            String userId,
            String permission) {
        return Optional.ofNullable(permissions.get(
                new PermissionKey(enterpriseId, userId, permission)));
    }

    @Override
    public synchronized java.util.List<EnterpriseUserPermission> findEnabled(
            String enterpriseId,
            String userId) {
        return permissions.values().stream()
                .filter(permission -> permission.enterpriseId().equals(enterpriseId))
                .filter(permission -> permission.userId().equals(userId))
                .filter(EnterpriseUserPermission::enabled)
                .sorted(java.util.Comparator.comparing(EnterpriseUserPermission::permission))
                .toList();
    }

    @Override
    public synchronized java.util.List<EnterpriseUserPermission> findEnabledForUpdate(
            String enterpriseId,
            String userId) {
        return findEnabled(enterpriseId, userId);
    }

    @Override
    public synchronized java.util.List<EnterpriseUserPermission> findRequestedForUpdate(
            String enterpriseId,
            String userId,
            java.util.List<String> orderedPermissions) {
        java.util.List<String> requested = java.util.List.copyOf(
                java.util.Objects.requireNonNull(orderedPermissions, "orderedPermissions"));
        if (requested.isEmpty()
                || requested.size() > 32
                || !requested.contains("configuration.read")
                || new java.util.HashSet<>(requested).size() != requested.size()
                || !requested.equals(requested.stream().sorted().toList())) {
            throw new IllegalArgumentException("requested permissions are not canonical");
        }
        return requested.stream()
                .map(permission -> permissions.get(
                        new PermissionKey(enterpriseId, userId, permission)))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    @Override
    public synchronized EnterpriseDevice insert(EnterpriseDevice device) {
        EnterpriseDevice existing = devices.get(device.deviceId());
        if (existing != null) {
            if (existing.equals(device)) {
                return existing;
            }
            throw conflict("persistence.device_conflict", "device ID already has different data");
        }
        DeviceKey key = new DeviceKey(device.enterpriseId(), device.deviceKeyId());
        String keyOwner = deviceKeyIndex.get(key);
        if (keyOwner != null && !keyOwner.equals(device.deviceId())) {
            throw conflict("persistence.device_key_conflict", "device key already belongs to another device");
        }
        DevicePublicKey publicKey =
                new DevicePublicKey(device.enterpriseId(), device.publicKeyDigest());
        String publicKeyOwner = devicePublicKeyIndex.get(publicKey);
        if (publicKeyOwner != null && !publicKeyOwner.equals(device.deviceId())) {
            throw conflict(
                    "persistence.device_key_conflict",
                    "public key already belongs to another device");
        }
        devices.put(device.deviceId(), device);
        deviceKeyIndex.put(key, device.deviceId());
        devicePublicKeyIndex.put(publicKey, device.deviceId());
        return device;
    }

    @Override
    public synchronized Optional<EnterpriseDevice> findById(String deviceId) {
        return Optional.ofNullable(devices.get(deviceId));
    }

    @Override
    public synchronized Optional<EnterpriseDevice> findByIdForUpdate(String deviceId) {
        return findById(deviceId);
    }

    @Override
    public synchronized Optional<EnterpriseDevice> findByKeyId(
            String enterpriseId,
            String deviceKeyId) {
        String deviceId = deviceKeyIndex.get(new DeviceKey(enterpriseId, deviceKeyId));
        return deviceId == null ? Optional.empty() : Optional.of(devices.get(deviceId));
    }

    @Override
    public synchronized Optional<EnterpriseDevice> findByPublicKeyDigest(
            String enterpriseId,
            String publicKeyDigest) {
        String deviceId = devicePublicKeyIndex.get(
                new DevicePublicKey(enterpriseId, publicKeyDigest));
        return deviceId == null ? Optional.empty() : Optional.of(devices.get(deviceId));
    }

    @Override
    public synchronized DeviceEnrollmentGrant insert(DeviceEnrollmentGrant grant) {
        UUID codeOwner = enrollmentCodeIndex.get(grant.codeDigest());
        if (codeOwner != null && !codeOwner.equals(grant.enrollmentGrantId())) {
            throw conflict(
                    "persistence.enrollment_grant_conflict",
                    "enrollment code digest already belongs to another grant");
        }
        DeviceEnrollmentGrant stored = insertImmutable(
                enrollmentGrants,
                grant.enrollmentGrantId(),
                grant,
                "persistence.enrollment_grant_conflict");
        enrollmentCodeIndex.put(grant.codeDigest(), grant.enrollmentGrantId());
        return stored;
    }

    @Override
    public synchronized Optional<DeviceEnrollmentGrant> findEnrollmentGrantById(
            UUID enrollmentGrantId) {
        return Optional.ofNullable(enrollmentGrants.get(enrollmentGrantId));
    }

    @Override
    public synchronized Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigest(
            String codeDigest) {
        UUID id = enrollmentCodeIndex.get(codeDigest);
        return id == null ? Optional.empty() : Optional.of(enrollmentGrants.get(id));
    }

    @Override
    public synchronized Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigestForUpdate(
            String codeDigest) {
        return findEnrollmentGrantByCodeDigest(codeDigest);
    }

    @Override
    public synchronized DeviceEnrollmentGrant consume(
            UUID enrollmentGrantId,
            java.time.Instant consumedAt) {
        DeviceEnrollmentGrant current = enrollmentGrants.get(enrollmentGrantId);
        if (current == null) {
            throw integrity(
                    "persistence.enrollment_grant_missing",
                    "enrollment grant does not exist");
        }
        if (current.consumedAt() != null) {
            throw conflict(
                    "persistence.enrollment_grant_consumed",
                    "enrollment grant has already been consumed");
        }
        DeviceEnrollmentGrant consumed = new DeviceEnrollmentGrant(
                current.enrollmentGrantId(),
                current.codeDigest(),
                current.enterpriseId(),
                current.authorizedUserId(),
                current.issuedAt(),
                current.expiresAt(),
                consumedAt,
                current.disabledAt());
        enrollmentGrants.put(enrollmentGrantId, consumed);
        return consumed;
    }

    @Override
    public synchronized DeviceChallenge insert(DeviceChallenge challenge) {
        if (!identities.containsKey(challenge.verifiedIdentityId())) {
            throw integrity(
                    "persistence.identity_missing",
                    "challenge references a missing verified identity");
        }
        return insertImmutable(
                challenges,
                challenge.challengeId(),
                challenge,
                "persistence.challenge_conflict");
    }

    @Override
    public synchronized Optional<DeviceChallenge> findChallengeById(UUID challengeId) {
        return Optional.ofNullable(challenges.get(challengeId));
    }

    @Override
    public synchronized Optional<DeviceChallenge> findChallengeForUpdate(UUID challengeId) {
        return findChallengeById(challengeId);
    }

    @Override
    public synchronized DeviceChallenge consume(
            UUID challengeId,
            java.time.Instant consumedAt,
            String consumedBy,
            String requestDigest) {
        DeviceChallenge current = challenges.get(challengeId);
        if (current == null) {
            throw integrity("persistence.challenge_missing", "device challenge does not exist");
        }
        if (current.consumedAt() != null) {
            return current;
        }
        DeviceChallenge consumed = new DeviceChallenge(
                current.challengeId(),
                current.purpose(),
                current.verifiedIdentityId(),
                current.clientInstanceId(),
                current.expectedDeviceKeyId(),
                current.expectedPublicKeyDigest(),
                current.nonce(),
                current.audience(),
                current.allowedAlgorithms(),
                current.challengeDigest(),
                current.issuedAt(),
                current.expiresAt(),
                consumedAt,
                consumedBy,
                requestDigest);
        challenges.put(challengeId, consumed);
        return consumed;
    }

    @Override
    public synchronized AccessTokenIssuance insert(AccessTokenIssuance issuance) {
        if (!devices.containsKey(issuance.deviceId())) {
            throw integrity("persistence.device_missing", "token references a missing device");
        }
        if (!challenges.containsKey(issuance.challengeId())) {
            throw integrity("persistence.challenge_missing", "token references a missing challenge");
        }
        return insertImmutable(
                tokenIssuances,
                issuance.tokenId(),
                issuance,
                "persistence.token_conflict");
    }

    @Override
    public synchronized Optional<AccessTokenIssuance> findTokenIssuanceById(UUID tokenId) {
        return Optional.ofNullable(tokenIssuances.get(tokenId));
    }

    @Override
    public synchronized EnterpriseSessionChallengeBundle commitChallengeOutcome(
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding) {
        return required(() -> {
            EnterpriseSessionChallengeBundle requested =
                    new EnterpriseSessionChallengeBundle(challenge, binding);
            EnterpriseSessionPersistenceValidator.validateChallengeBundle(requested);
            Optional<EnterpriseSessionChallengeBundle> existing =
                    loadChallengeById(challenge.challengeId());
            if (existing.isPresent()) {
                if (existing.get().equals(requested)) {
                    return existing.get();
                }
                throw conflict(
                        "persistence.enterprise_session_challenge_conflict",
                        "enterprise session challenge already differs");
            }
            UUID correlationOwner = enterpriseSessionCorrelationIndex.get(binding.correlationId());
            UUID digestOwner = enterpriseSessionBindingDigestIndex.get(
                    binding.challengeBindingDigest());
            if ((correlationOwner != null && !correlationOwner.equals(challenge.challengeId()))
                    || (digestOwner != null && !digestOwner.equals(challenge.challengeId()))) {
                throw conflict(
                        "persistence.enterprise_session_binding_conflict",
                        "enterprise session binding identity is already in use");
            }
            insert(challenge);
            enterpriseSessionBindings.put(challenge.challengeId(), binding);
            enterpriseSessionCorrelationIndex.put(binding.correlationId(), challenge.challengeId());
            enterpriseSessionBindingDigestIndex.put(
                    binding.challengeBindingDigest(), challenge.challengeId());
            return EnterpriseSessionPersistenceValidator.validateChallengeBundle(requested);
        });
    }

    @Override
    public synchronized Optional<EnterpriseSessionChallengeBundle> loadChallengeById(
            UUID challengeId) {
        DeviceChallenge challenge = challenges.get(challengeId);
        EnterpriseSessionChallengeBinding binding = enterpriseSessionBindings.get(challengeId);
        if (challenge == null && binding == null) {
            return Optional.empty();
        }
        if (challenge == null || binding == null) {
            throw integrity(
                    "persistence.enterprise_session_partial_commit",
                    "enterprise session challenge bundle is incomplete");
        }
        return Optional.of(EnterpriseSessionPersistenceValidator.validateChallengeBundle(
                new EnterpriseSessionChallengeBundle(challenge, binding)));
    }

    @Override
    public synchronized Optional<EnterpriseSessionChallengeBundle> loadChallengeByCorrelationId(
            UUID correlationId) {
        UUID challengeId = enterpriseSessionCorrelationIndex.get(correlationId);
        return challengeId == null ? Optional.empty() : loadChallengeById(challengeId);
    }

    @Override
    public synchronized Optional<EnterpriseSessionChallengeBundle> loadChallengeForUpdate(
            UUID challengeId) {
        return loadChallengeById(challengeId);
    }

    @Override
    public synchronized EnterpriseSessionLeaseIssuance commitLeaseOutcome(
            EnterpriseSessionLeaseCommit commit) {
        return required(() -> {
            EnterpriseSessionChallengeBundle bundle = loadChallengeForUpdate(
                            commit.issuance().challengeId())
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_challenge_missing",
                            "enterprise session challenge is missing"));
            if (!bundle.binding().recordDigest().equals(commit.expectedChallengeRecordDigest())
                    || !bundle.binding().challengeBindingDigest()
                            .equals(commit.expectedBindingDigest())
                    || !commit.requestDigest().equals(commit.issuance().requestDigest())) {
                throw conflict(
                        "persistence.enterprise_session_binding_conflict",
                        "enterprise session expected binding differs");
            }
            VerifiedEnterpriseIdentity identity = identities.get(commit.issuance().verifiedIdentityId());
            EnterpriseDevice device = devices.get(commit.issuance().deviceId());
            if (identity == null || device == null) {
                throw integrity(
                        "persistence.enterprise_session_lease_corrupt",
                        "enterprise session lease references missing owner facts");
            }
            EnterpriseSessionPersistenceValidator.validateLease(
                    commit.issuance(), bundle, identity, device);
            Optional<EnterpriseSessionLeaseIssuance> existing =
                    loadLeaseByTokenId(commit.issuance().tokenId());
            if (existing.isPresent()) {
                if (existing.get().equals(commit.issuance())) {
                    return existing.get();
                }
                throw conflict(
                        "persistence.enterprise_session_lease_conflict",
                        "enterprise session token already differs");
            }
            UUID tokenDigestOwner = enterpriseSessionTokenDigestIndex.get(
                    commit.issuance().tokenDigest());
            UUID challengeOwner = enterpriseSessionChallengeLeaseIndex.get(
                    commit.issuance().challengeId());
            if ((tokenDigestOwner != null
                            && !tokenDigestOwner.equals(commit.issuance().tokenId()))
                    || (challengeOwner != null
                            && !challengeOwner.equals(commit.issuance().tokenId()))) {
                throw conflict(
                        "persistence.enterprise_session_lease_conflict",
                        "enterprise session lease identity is already in use");
            }
            DeviceChallenge challenge = bundle.challenge();
            if (challenge.consumedAt() != null
                    && (!challenge.consumedAt().equals(commit.consumedAt())
                            || !commit.consumedBy().equals(challenge.consumedBy())
                            || !commit.requestDigest().equals(challenge.consumedRequestDigest()))) {
                throw conflict(
                        "persistence.enterprise_session_challenge_conflict",
                        "enterprise session challenge was already consumed differently");
            }
            if (challenge.consumedAt() == null) {
                consume(
                        challenge.challengeId(),
                        commit.consumedAt(),
                        commit.consumedBy(),
                        commit.requestDigest());
            }
            enterpriseSessionLeases.put(commit.issuance().tokenId(), commit.issuance());
            enterpriseSessionTokenDigestIndex.put(
                    commit.issuance().tokenDigest(), commit.issuance().tokenId());
            enterpriseSessionChallengeLeaseIndex.put(
                    commit.issuance().challengeId(), commit.issuance().tokenId());
            return commit.issuance();
        });
    }

    @Override
    public synchronized Optional<EnterpriseSessionLeaseIssuance> loadLeaseByTokenId(
            UUID tokenId) {
        EnterpriseSessionLeaseIssuance issuance = enterpriseSessionLeases.get(tokenId);
        if (issuance == null) {
            return Optional.empty();
        }
        EnterpriseSessionChallengeBundle bundle = loadChallengeById(issuance.challengeId())
                .orElseThrow(() -> integrity(
                        "persistence.enterprise_session_lease_corrupt",
                        "enterprise session lease references a missing challenge"));
        VerifiedEnterpriseIdentity identity = identities.get(issuance.verifiedIdentityId());
        EnterpriseDevice device = devices.get(issuance.deviceId());
        if (identity == null || device == null) {
            throw integrity(
                    "persistence.enterprise_session_lease_corrupt",
                    "enterprise session lease references missing owner facts");
        }
        return Optional.of(EnterpriseSessionPersistenceValidator.validateLease(
                issuance, bundle, identity, device));
    }

    @Override
    public synchronized ImmutableConfigurationSnapshot insert(
            ImmutableConfigurationSnapshot snapshot) {
        RevisionKey key = new RevisionKey(snapshot.snapshotId(), snapshot.revision());
        ImmutableConfigurationSnapshot current = snapshots.get(key);
        if (current != null) {
            if (current.equals(snapshot)) {
                return current;
            }
            throw conflict(
                    "persistence.configuration_revision_conflict",
                    "configuration revision already has a different digest");
        }
        if (snapshot.active() && snapshots.values().stream()
                .anyMatch(ImmutableConfigurationSnapshot::active)) {
            throw conflict(
                    "persistence.configuration_active_conflict",
                    "only one active configuration snapshot is allowed");
        }
        snapshots.put(key, snapshot);
        return snapshot;
    }

    @Override
    public synchronized Optional<ImmutableConfigurationSnapshot> findSnapshot(
            String snapshotId,
            String revision) {
        return Optional.ofNullable(snapshots.get(new RevisionKey(snapshotId, revision)));
    }

    @Override
    public synchronized Optional<ImmutableConfigurationSnapshot> findActive() {
        return snapshots.values().stream()
                .filter(ImmutableConfigurationSnapshot::active)
                .findFirst();
    }

    @Override
    public synchronized ImmutablePackageDocument insert(ImmutablePackageDocument document) {
        return insertImmutable(
                packages,
                new RevisionKey(document.packageId(), document.revision()),
                document,
                "persistence.package_revision_conflict");
    }

    @Override
    public synchronized Optional<ImmutablePackageDocument> findPackage(
            String packageId,
            String revision) {
        return Optional.ofNullable(packages.get(new RevisionKey(packageId, revision)));
    }

    @Override
    public synchronized ModelInvocation accept(ModelInvocation invocation) {
        UUID existingId = modelInvocationRequestIndex.get(invocation.clientRequestScope());
        if (existingId != null) {
            ModelInvocation existing = modelInvocations.get(existingId);
            if (existing.requestDigest().equals(invocation.requestDigest())) {
                return existing;
            }
            throw conflict(
                    "model_gateway.client_request_conflict",
                    "client request id is already bound to a different request digest");
        }
        ModelInvocation existingById = modelInvocations.get(invocation.invocationId());
        if (existingById != null && !existingById.equals(invocation)) {
            throw conflict(
                    "model_gateway.invocation_id_conflict",
                    "invocation id is already bound to different data");
        }
        modelInvocations.put(invocation.invocationId(), invocation);
        modelInvocationRequestIndex.put(
                invocation.clientRequestScope(), invocation.invocationId());
        return invocation;
    }

    @Override
    public synchronized Optional<ModelInvocation> findById(UUID invocationId) {
        return Optional.ofNullable(modelInvocations.get(invocationId));
    }

    @Override
    public synchronized Optional<ModelInvocation> findByClientRequest(
            ModelInvocation.ClientRequestScope clientRequestScope) {
        UUID invocationId = modelInvocationRequestIndex.get(clientRequestScope);
        return invocationId == null
                ? Optional.empty()
                : Optional.ofNullable(modelInvocations.get(invocationId));
    }

    @Override
    public synchronized Optional<ModelInvocation> findByIdForUpdate(UUID invocationId) {
        return findById(invocationId);
    }

    @Override
    public synchronized ModelInvocation update(
            ModelInvocation invocation,
            long expectedStatusRevision) {
        ModelInvocation current = modelInvocations.get(invocation.invocationId());
        if (current == null) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "model invocation does not exist");
        }
        if (current.statusRevision() != expectedStatusRevision) {
            throw conflict(
                    "model_gateway.status_revision_conflict",
                    "invocation status revision changed");
        }
        if (!current.clientRequestScope().equals(invocation.clientRequestScope())
                || !current.requestDigest().equals(invocation.requestDigest())) {
            throw conflict(
                    "model_gateway.invocation_identity_conflict",
                    "invocation immutable identity changed");
        }
        modelInvocations.put(invocation.invocationId(), invocation);
        return invocation;
    }

    @Override
    public synchronized ModelInvocationDurableEvent append(
            ModelInvocationDurableEvent event) {
        if (!modelInvocations.containsKey(event.invocationId())) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "durable event references a missing invocation");
        }
        return insertImmutable(
                modelInvocationEvents,
                new EventKey(event.invocationId(), event.eventSequence()),
                event,
                "model_gateway.event_sequence_conflict");
    }

    @Override
    public synchronized java.util.List<ModelInvocationDurableEvent> findAfter(
            UUID invocationId,
            long afterSequence,
            int limit) {
        if (afterSequence < 0 || limit < 1 || limit > 1_000) {
            throw new IllegalArgumentException("durable event query is outside bounds");
        }
        return modelInvocationEvents.values().stream()
                .filter(event -> event.invocationId().equals(invocationId))
                .filter(event -> event.eventSequence() > afterSequence)
                .sorted(java.util.Comparator.comparingLong(
                        ModelInvocationDurableEvent::eventSequence))
                .limit(limit)
                .toList();
    }

    @Override
    public synchronized ModelInvocationRecoveryLease insert(
            ModelInvocationRecoveryLease lease) {
        if (!modelInvocations.containsKey(lease.invocationId())) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "lease references a missing invocation");
        }
        return insertImmutable(
                modelInvocationLeases,
                lease.invocationId(),
                lease,
                "model_gateway.lease_conflict");
    }

    @Override
    public synchronized Optional<ModelInvocationRecoveryLease> find(UUID invocationId) {
        return Optional.ofNullable(modelInvocationLeases.get(invocationId));
    }

    @Override
    public synchronized Optional<ModelInvocationRecoveryLease> findForUpdate(
            UUID invocationId) {
        return find(invocationId);
    }

    @Override
    public synchronized java.time.Instant currentDatabaseTime() {
        return databaseClock.instant();
    }

    @Override
    public synchronized ModelInvocationRecoveryLease replace(
            ModelInvocationRecoveryLease lease,
            long expectedFencingEpoch) {
        ModelInvocationRecoveryLease current =
                modelInvocationLeases.get(lease.invocationId());
        if (current == null) {
            throw integrity(
                    "model_gateway.lease_missing",
                    "model invocation lease does not exist");
        }
        if (current.fencingEpoch() != expectedFencingEpoch) {
            throw conflict(
                    "model_gateway.fencing_epoch_conflict",
                    "invocation lease fencing epoch changed");
        }
        modelInvocationLeases.put(lease.invocationId(), lease);
        return lease;
    }

    @Override
    public synchronized ModelInvocationAuditOutbox insert(
            ModelInvocationAuditOutbox outbox) {
        if (!modelInvocations.containsKey(outbox.invocationId())) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "audit outbox references a missing invocation");
        }
        return insertImmutable(
                modelInvocationAuditOutbox,
                outbox.outboxId(),
                outbox,
                "model_gateway.audit_outbox_conflict");
    }

    @Override
    public synchronized java.util.List<ModelInvocationAuditOutbox> findPending(int limit) {
        if (limit < 1 || limit > 1_000) {
            throw new IllegalArgumentException("outbox query limit is outside bounds");
        }
        return modelInvocationAuditOutbox.values().stream()
                .filter(outbox -> outbox.publishedAt() == null)
                .sorted(java.util.Comparator
                        .comparing(ModelInvocationAuditOutbox::createdAt)
                        .thenComparing(ModelInvocationAuditOutbox::outboxId))
                .limit(limit)
                .toList();
    }

    @Override
    public synchronized ModelProviderAttempt register(ModelProviderAttempt attempt) {
        if (!modelInvocations.containsKey(attempt.authorityInvocationId())) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "provider attempt references a missing invocation");
        }
        return insertImmutable(
                modelProviderAttempts,
                attempt.identity(),
                attempt,
                "model_gateway.provider_attempt_conflict");
    }

    @Override
    public synchronized Optional<ModelProviderAttempt> findAttempt(
            ModelProviderAttempt.AttemptIdentity identity) {
        return Optional.ofNullable(modelProviderAttempts.get(identity));
    }

    @Override
    public synchronized ProviderUsageFact insert(ProviderUsageFact fact) {
        if (!modelProviderAttempts.containsKey(fact.attemptIdentity())) {
            throw integrity(
                    "model_gateway.provider_attempt_missing",
                    "Provider Usage references an unregistered attempt");
        }
        ProviderUsageFact existing = providerUsageFacts.get(fact.attemptIdentity());
        if (existing == null) {
            providerUsageFacts.put(fact.attemptIdentity(), fact);
            return fact;
        }
        if (existing.usageDigest().equals(fact.usageDigest())) {
            return existing;
        }
        throw conflict(
                "model_gateway.provider_usage_conflict",
                "Provider Usage attempt is already bound to a different digest");
    }

    @Override
    public synchronized Optional<ProviderUsageFact> findUsageFact(
            ModelProviderAttempt.AttemptIdentity identity) {
        return Optional.ofNullable(providerUsageFacts.get(identity));
    }

    @Override
    public synchronized java.util.List<ProviderUsageFact> findByInvocation(
            UUID authorityInvocationId) {
        return providerUsageFacts.values().stream()
                .filter(fact -> fact.authorityInvocationId().equals(authorityInvocationId))
                .sorted(java.util.Comparator
                        .comparingLong(ProviderUsageFact::fencingEpoch)
                        .thenComparing(ProviderUsageFact::providerAttemptKey))
                .toList();
    }

    @Override
    public synchronized Optional<ModelInvocationCacheContext> findContextByInvocationId(
            UUID invocationId) {
        return Optional.ofNullable(modelInvocationCacheContexts.get(invocationId));
    }

    @Override
    public synchronized ModelInvocationCacheContext insertImmutable(
            ModelInvocationCacheContext context) {
        if (!modelInvocations.containsKey(context.invocationId())) {
            throw integrity(
                    "model_gateway.invocation_missing",
                    "cache context references a missing invocation");
        }
        return insertImmutable(
                modelInvocationCacheContexts,
                context.invocationId(),
                context,
                "model_gateway.cache_context_conflict");
    }

    @Override
    public synchronized Optional<PromptCachePlan> findPlanByInvocationId(
            UUID invocationId) {
        return Optional.ofNullable(promptCachePlans.get(invocationId));
    }

    @Override
    public synchronized Optional<PromptCachePlan> findLatestByMonotonicityIdentity(
            PromptCachePlan.MonotonicityIdentity identity) {
        return promptCachePlans.values().stream()
                .filter(plan -> plan.monotonicityIdentity().equals(identity))
                .max(java.util.Comparator
                        .comparing(PromptCachePlan::createdAt)
                        .thenComparing(PromptCachePlan::invocationId));
    }

    @Override
    public synchronized PromptCachePlan insertImmutable(PromptCachePlan plan) {
        if (!modelInvocationCacheContexts.containsKey(plan.invocationId())) {
            throw integrity(
                    "model_gateway.cache_context_missing",
                    "prompt cache plan references a missing cache context");
        }
        return insertImmutable(
                promptCachePlans,
                plan.invocationId(),
                plan,
                "model_gateway.cache_plan_conflict");
    }

    @Override
    public synchronized <T> T required(Supplier<T> work) {
        Snapshot before = snapshot();
        try {
            return work.get();
        } catch (RuntimeException exception) {
            restore(before);
            throw exception;
        }
    }

    private Snapshot snapshot() {
        return new Snapshot(
                new HashMap<>(identities),
                new HashMap<>(permissions),
                new HashMap<>(devices),
                new HashMap<>(deviceKeyIndex),
                new HashMap<>(devicePublicKeyIndex),
                new HashMap<>(enrollmentGrants),
                new HashMap<>(enrollmentCodeIndex),
                new HashMap<>(challenges),
                new HashMap<>(tokenIssuances),
                new HashMap<>(enterpriseSessionBindings),
                new HashMap<>(enterpriseSessionCorrelationIndex),
                new HashMap<>(enterpriseSessionBindingDigestIndex),
                new HashMap<>(enterpriseSessionLeases),
                new HashMap<>(enterpriseSessionTokenDigestIndex),
                new HashMap<>(enterpriseSessionChallengeLeaseIndex),
                new HashMap<>(snapshots),
                new HashMap<>(packages),
                new HashMap<>(modelInvocations),
                new HashMap<>(modelInvocationRequestIndex),
                new HashMap<>(modelInvocationEvents),
                new HashMap<>(modelInvocationLeases),
                new HashMap<>(modelInvocationAuditOutbox),
                new HashMap<>(modelProviderAttempts),
                new HashMap<>(providerUsageFacts),
                new HashMap<>(modelInvocationCacheContexts),
                new HashMap<>(promptCachePlans));
    }

    private void restore(Snapshot snapshot) {
        identities = snapshot.identities();
        permissions = snapshot.permissions();
        devices = snapshot.devices();
        deviceKeyIndex = snapshot.deviceKeyIndex();
        devicePublicKeyIndex = snapshot.devicePublicKeyIndex();
        enrollmentGrants = snapshot.enrollmentGrants();
        enrollmentCodeIndex = snapshot.enrollmentCodeIndex();
        challenges = snapshot.challenges();
        tokenIssuances = snapshot.tokenIssuances();
        enterpriseSessionBindings = snapshot.enterpriseSessionBindings();
        enterpriseSessionCorrelationIndex = snapshot.enterpriseSessionCorrelationIndex();
        enterpriseSessionBindingDigestIndex = snapshot.enterpriseSessionBindingDigestIndex();
        enterpriseSessionLeases = snapshot.enterpriseSessionLeases();
        enterpriseSessionTokenDigestIndex = snapshot.enterpriseSessionTokenDigestIndex();
        enterpriseSessionChallengeLeaseIndex = snapshot.enterpriseSessionChallengeLeaseIndex();
        snapshots = snapshot.snapshots();
        packages = snapshot.packages();
        modelInvocations = snapshot.modelInvocations();
        modelInvocationRequestIndex = snapshot.modelInvocationRequestIndex();
        modelInvocationEvents = snapshot.modelInvocationEvents();
        modelInvocationLeases = snapshot.modelInvocationLeases();
        modelInvocationAuditOutbox = snapshot.modelInvocationAuditOutbox();
        modelProviderAttempts = snapshot.modelProviderAttempts();
        providerUsageFacts = snapshot.providerUsageFacts();
        modelInvocationCacheContexts = snapshot.modelInvocationCacheContexts();
        promptCachePlans = snapshot.promptCachePlans();
    }

    private static <K, V> V insertImmutable(
            Map<K, V> map,
            K key,
            V value,
            String conflictCode) {
        V existing = map.get(key);
        if (existing == null) {
            map.put(key, value);
            return value;
        }
        if (existing.equals(value)) {
            return existing;
        }
        throw conflict(conflictCode, "immutable persistence key already has different data");
    }

    private static PersistenceConflictException conflict(String code, String message) {
        return new PersistenceConflictException(code, message);
    }

    private static PersistenceIntegrityException integrity(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }

    private record PermissionKey(String enterpriseId, String userId, String permission) {}

    private record DeviceKey(String enterpriseId, String deviceKeyId) {}

    private record DevicePublicKey(String enterpriseId, String publicKeyDigest) {}

    private record RevisionKey(String id, String revision) {}

    private record EventKey(UUID invocationId, long eventSequence) {}

    private record Snapshot(
            Map<UUID, VerifiedEnterpriseIdentity> identities,
            Map<PermissionKey, EnterpriseUserPermission> permissions,
            Map<String, EnterpriseDevice> devices,
            Map<DeviceKey, String> deviceKeyIndex,
            Map<DevicePublicKey, String> devicePublicKeyIndex,
            Map<UUID, DeviceEnrollmentGrant> enrollmentGrants,
            Map<String, UUID> enrollmentCodeIndex,
            Map<UUID, DeviceChallenge> challenges,
            Map<UUID, AccessTokenIssuance> tokenIssuances,
            Map<UUID, EnterpriseSessionChallengeBinding> enterpriseSessionBindings,
            Map<UUID, UUID> enterpriseSessionCorrelationIndex,
            Map<String, UUID> enterpriseSessionBindingDigestIndex,
            Map<UUID, EnterpriseSessionLeaseIssuance> enterpriseSessionLeases,
            Map<String, UUID> enterpriseSessionTokenDigestIndex,
            Map<UUID, UUID> enterpriseSessionChallengeLeaseIndex,
            Map<RevisionKey, ImmutableConfigurationSnapshot> snapshots,
            Map<RevisionKey, ImmutablePackageDocument> packages,
            Map<UUID, ModelInvocation> modelInvocations,
            Map<ModelInvocation.ClientRequestScope, UUID> modelInvocationRequestIndex,
            Map<EventKey, ModelInvocationDurableEvent> modelInvocationEvents,
            Map<UUID, ModelInvocationRecoveryLease> modelInvocationLeases,
            Map<UUID, ModelInvocationAuditOutbox> modelInvocationAuditOutbox,
            Map<ModelProviderAttempt.AttemptIdentity, ModelProviderAttempt>
                    modelProviderAttempts,
            Map<ModelProviderAttempt.AttemptIdentity, ProviderUsageFact>
                    providerUsageFacts,
            Map<UUID, ModelInvocationCacheContext> modelInvocationCacheContexts,
            Map<UUID, PromptCachePlan> promptCachePlans) {}
}
