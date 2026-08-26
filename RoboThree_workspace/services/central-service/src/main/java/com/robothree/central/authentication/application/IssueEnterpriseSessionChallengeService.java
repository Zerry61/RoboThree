package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceTrustDecision;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionDecisionDigests;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class IssueEnterpriseSessionChallengeService {

    private final VerifiedIdentityHandleResolver handles;
    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final EnterprisePermissionRepository permissions;
    private final EnterpriseDeviceTrustProvider deviceTrust;
    private final CompatibilityEvaluator compatibility;
    private final EnterpriseSessionPersistence sessions;
    private final CentralTransactionRunner transactions;
    private final AuthenticationEntropySource entropy;
    private final Clock clock;
    private final AuthenticationSecurityPolicy policy;
    private final AccessTokenSecurityPolicy tokenPolicy;

    public IssueEnterpriseSessionChallengeService(
            VerifiedIdentityHandleResolver handles,
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            EnterprisePermissionRepository permissions,
            EnterpriseDeviceTrustProvider deviceTrust,
            CompatibilityEvaluator compatibility,
            EnterpriseSessionPersistence sessions,
            CentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            Clock clock,
            AuthenticationSecurityPolicy policy,
            AccessTokenSecurityPolicy tokenPolicy) {
        this.handles = Objects.requireNonNull(handles, "handles");
        this.identities = Objects.requireNonNull(identities, "identities");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.permissions = Objects.requireNonNull(permissions, "permissions");
        this.deviceTrust = Objects.requireNonNull(deviceTrust, "deviceTrust");
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.tokenPolicy = Objects.requireNonNull(tokenPolicy, "tokenPolicy");
        if (!EnterpriseSessionChallengeBinding.AUDIENCE.equals(tokenPolicy.audience())) {
            throw new IllegalArgumentException("Session policy audience differs from the Contract");
        }
    }

    public Result issue(Command command) {
        Objects.requireNonNull(command, "command");
        try {
            return transactions.required(() -> issueWithinTransaction(command));
        } catch (PersistenceConflictException conflict) {
            if (!conflict.code().startsWith("persistence.enterprise_session_")) {
                throw conflict;
            }
            return transactions.required(() -> replayExisting(command));
        }
    }

    private Result issueWithinTransaction(Command command) {
        Instant now = now();
        var resolved = handles.resolveForChallenge(command.opaqueHandle());
        var existing = sessions.loadChallengeByCorrelationId(command.correlationId());
        if (existing.isPresent()) {
            return requireExactReplay(existing.get(), command, resolved, now);
        }
        VerifiedEnterpriseIdentity identity = requireActiveIdentity(
                identities.findVerifiedIdentityByIdForUpdate(resolved.verifiedIdentityId())
                        .orElseThrow(IssueEnterpriseSessionChallengeService::invalidHandle),
                now);
        EnterpriseDevice device = requireLockedDevice(identity, command.deviceKeyId());
        DeviceTrustDecision trust = deviceTrust.requireTrusted(device, now);
        requireManagedCompliant(trust.device());
        requireRequestedPermissions(identity, command.requiredPermissions());
        compatibility.requireCompatible(command.currentClientInstanceId().toString());

        UUID challengeId = entropy.nextUuid();
        byte[] nonceBytes = entropy.nextBytes(32);
        String nonce;
        try {
            nonce = AuthenticationCrypto.base64Url(nonceBytes);
        } finally {
            Arrays.fill(nonceBytes, (byte) 0);
        }
        Instant expiresAt = now.plus(policy.challengeTtl());
        String challengeDigest = EnterpriseSessionDecisionDigests.challengeBindingDigest(
                identity.verifiedIdentityId(),
                command.currentClientInstanceId(),
                command.requiredPermissions(),
                command.deviceKeyId(),
                command.correlationId(),
                challengeId,
                nonce,
                now,
                expiresAt);
        DeviceChallenge challenge = new DeviceChallenge(
                challengeId,
                EnterpriseSessionChallengeBinding.PURPOSE,
                identity.verifiedIdentityId(),
                command.currentClientInstanceId().toString(),
                device.deviceKeyId(),
                device.publicKeyDigest(),
                nonce,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                List.of("ES256"),
                challengeDigest,
                now,
                expiresAt,
                null,
                null,
                null);
        EnterpriseSessionChallengeBinding provisional = new EnterpriseSessionChallengeBinding(
                challengeId,
                identity.verifiedIdentityId(),
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                resolved.identitySourceRevision(),
                command.currentClientInstanceId(),
                EnterpriseSessionChallengeBinding.AUDIENCE,
                command.requiredPermissions(),
                device.deviceKeyId(),
                command.correlationId(),
                challengeDigest,
                "0".repeat(64),
                now);
        EnterpriseSessionChallengeBinding binding = new EnterpriseSessionChallengeBinding(
                provisional.challengeId(), provisional.verifiedIdentityId(),
                provisional.claimsProfile(), provisional.identitySourceRevision(),
                provisional.currentClientInstanceId(), provisional.audience(),
                provisional.requiredPermissions(), provisional.deviceKeyId(),
                provisional.correlationId(), provisional.challengeBindingDigest(),
                EnterpriseSessionPersistenceDigests.challengeRecordDigest(provisional),
                provisional.createdAt());
        return result(sessions.commitChallengeOutcome(challenge, binding));
    }

    private Result replayExisting(Command command) {
        Instant now = now();
        var resolved = handles.resolveForChallenge(command.opaqueHandle());
        var existing = sessions.loadChallengeByCorrelationId(command.correlationId())
                .orElseThrow(IssueEnterpriseSessionChallengeService::sessionConflict);
        return requireExactReplay(existing, command, resolved, now);
    }

    private Result requireExactReplay(
            EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle bundle,
            Command command,
            VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle resolved,
            Instant now) {
        var challenge = bundle.challenge();
        var binding = bundle.binding();
        boolean exact = binding.verifiedIdentityId().equals(resolved.verifiedIdentityId())
                && binding.identitySourceRevision().equals(resolved.identitySourceRevision())
                && binding.currentClientInstanceId().equals(command.currentClientInstanceId())
                && binding.audience().equals(command.audience())
                && binding.requiredPermissions().equals(command.requiredPermissions())
                && binding.deviceKeyId().equals(command.deviceKeyId())
                && binding.correlationId().equals(command.correlationId())
                && EnterpriseSessionChallengeBinding.PURPOSE.equals(challenge.purpose());
        if (!exact) {
            throw sessionConflict();
        }
        if (challenge.consumedAt() != null) {
            throw EnterpriseAuthenticationException.conflict(
                    "device_challenge_replayed",
                    "The enterprise session challenge was already used.");
        }
        if (!now.isBefore(challenge.expiresAt())) {
            throw EnterpriseAuthenticationException.conflict(
                    "device_challenge_expired",
                    "The enterprise session challenge expired.");
        }
        return result(bundle);
    }

    private EnterpriseDevice requireLockedDevice(
            VerifiedEnterpriseIdentity identity,
            String deviceKeyId) {
        EnterpriseDevice observed = devices.findByKeyId(identity.enterpriseId(), deviceKeyId)
                .orElseThrow(IssueEnterpriseSessionChallengeService::deviceDenied);
        EnterpriseDevice locked = devices.findByIdForUpdate(observed.deviceId())
                .orElseThrow(IssueEnterpriseSessionChallengeService::deviceDenied);
        if (!locked.equals(observed)
                || !locked.enterpriseId().equals(identity.enterpriseId())
                || !locked.deviceKeyId().equals(deviceKeyId)) {
            throw deviceDenied();
        }
        return locked;
    }

    private void requireRequestedPermissions(
            VerifiedEnterpriseIdentity identity,
            List<String> requested) {
        List<EnterpriseUserPermission> facts = permissions.findRequestedForUpdate(
                identity.enterpriseId(), identity.userId(), requested);
        if (facts.size() != requested.size()
                || !facts.stream().map(EnterpriseUserPermission::permission).toList().equals(requested)
                || facts.stream().anyMatch(value -> !value.enabled())) {
            throw EnterpriseAuthenticationException.authorization(
                    "permission_denied",
                    "The required enterprise permission is unavailable.");
        }
    }

    static VerifiedEnterpriseIdentity requireActiveIdentity(
            VerifiedEnterpriseIdentity identity,
            Instant now) {
        if (identity.disabledAt() != null || !now.isBefore(identity.expiresAt())) {
            throw invalidHandle();
        }
        return identity;
    }

    static void requireManagedCompliant(EnterpriseDevice device) {
        if (!"managed".equals(device.managedStatus())) {
            throw EnterpriseAuthenticationException.authorization(
                    "device_not_managed", "The enterprise device is not managed.");
        }
        if (!"compliant".equals(device.complianceStatus())) {
            throw EnterpriseAuthenticationException.authorization(
                    "device_not_compliant", "The enterprise device is not compliant.");
        }
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static Result result(
            EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle bundle) {
        DeviceChallenge value = bundle.challenge();
        return new Result(
                value.challengeId(), value.nonce(), value.issuedAt(), value.expiresAt(),
                value.audience(), UUID.fromString(value.clientInstanceId()),
                value.allowedAlgorithms(), "sha256:" + value.challengeDigest());
    }

    private static EnterpriseAuthenticationException invalidHandle() {
        return EnterpriseAuthenticationException.authentication(
                "enterprise_identity_handle_invalid",
                "The enterprise identity handle is invalid.");
    }

    private static EnterpriseAuthenticationException deviceDenied() {
        return EnterpriseAuthenticationException.authorization(
                "device_context_mismatch", "The enterprise device does not match the request.");
    }

    private static EnterpriseAuthenticationException sessionConflict() {
        return EnterpriseAuthenticationException.conflict(
                "enterprise_session_conflict",
                "The enterprise session request conflicts with an existing request.");
    }

    public record Command(
            OpaqueVerifiedIdentityHandle opaqueHandle,
            UUID currentClientInstanceId,
            String audience,
            List<String> requiredPermissions,
            String deviceKeyId,
            UUID correlationId) {
        public Command {
            Objects.requireNonNull(opaqueHandle, "opaqueHandle");
            Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
            if (!EnterpriseSessionChallengeBinding.AUDIENCE.equals(audience)) {
                throw new IllegalArgumentException("audience is unsupported");
            }
            requiredPermissions = EnterpriseSessionChallengeBinding.permissions(
                    requiredPermissions);
            if (deviceKeyId == null || !deviceKeyId.matches("^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$")) {
                throw new IllegalArgumentException("deviceKeyId is invalid");
            }
            Objects.requireNonNull(correlationId, "correlationId");
        }
    }

    public record Result(
            UUID challengeId,
            String nonce,
            Instant issuedAt,
            Instant expiresAt,
            String audience,
            UUID currentClientInstanceId,
            List<String> allowedAlgorithms,
            String challengeDigest) {
        public Result {
            Objects.requireNonNull(challengeId, "challengeId");
            Objects.requireNonNull(nonce, "nonce");
            Objects.requireNonNull(issuedAt, "issuedAt");
            Objects.requireNonNull(expiresAt, "expiresAt");
            Objects.requireNonNull(audience, "audience");
            Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
            allowedAlgorithms = List.copyOf(allowedAlgorithms);
            Objects.requireNonNull(challengeDigest, "challengeDigest");
        }
    }
}
