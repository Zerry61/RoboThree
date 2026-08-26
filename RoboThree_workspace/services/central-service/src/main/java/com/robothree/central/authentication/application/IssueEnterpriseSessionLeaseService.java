package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.DeviceTrustDecision;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionDecisionDigests;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseRequestDigestMaterial;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceValidator;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionSigningKeyHandleProvider;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Issues an enterprise Session Lease inside one persistence transaction.
 *
 * <p>The compact bearer is created inside the transaction closure and is returned only after the
 * aggregate challenge-consume/lease-insert commit succeeds. It is never persisted or replayed.
 */
public final class IssueEnterpriseSessionLeaseService {

    private static final int MINIMUM_TOKEN_LENGTH = 16;
    private static final int MAXIMUM_TOKEN_LENGTH = 16_384;

    private final VerifiedIdentityHandleResolver handles;
    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final EnterprisePermissionRepository permissions;
    private final EnterpriseDeviceTrustProvider deviceTrust;
    private final DeviceProofVerifier proofVerifier;
    private final CompatibilityEvaluator compatibility;
    private final EnterpriseSessionPersistence sessions;
    private final CentralTransactionRunner transactions;
    private final AuthenticationEntropySource entropy;
    private final EnterpriseSessionTokenCodec tokenCodec;
    private final EnterpriseSessionSigningKeyHandleProvider signingKeys;
    private final EnterpriseSessionDecisionAssembler assembler;
    private final Clock clock;
    private final AccessTokenSecurityPolicy policy;

    public IssueEnterpriseSessionLeaseService(
            VerifiedIdentityHandleResolver handles,
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            EnterprisePermissionRepository permissions,
            EnterpriseDeviceTrustProvider deviceTrust,
            DeviceProofVerifier proofVerifier,
            CompatibilityEvaluator compatibility,
            EnterpriseSessionPersistence sessions,
            CentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            EnterpriseSessionTokenCodec tokenCodec,
            EnterpriseSessionSigningKeyHandleProvider signingKeys,
            EnterpriseSessionDecisionAssembler assembler,
            Clock clock,
            AccessTokenSecurityPolicy policy) {
        this.handles = Objects.requireNonNull(handles, "handles");
        this.identities = Objects.requireNonNull(identities, "identities");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.permissions = Objects.requireNonNull(permissions, "permissions");
        this.deviceTrust = Objects.requireNonNull(deviceTrust, "deviceTrust");
        this.proofVerifier = Objects.requireNonNull(proofVerifier, "proofVerifier");
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.tokenCodec = Objects.requireNonNull(tokenCodec, "tokenCodec");
        this.signingKeys = Objects.requireNonNull(signingKeys, "signingKeys");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
        if (!EnterpriseSessionChallengeBinding.AUDIENCE.equals(policy.audience())) {
            throw new IllegalArgumentException("Session policy audience differs from the Contract");
        }
    }

    public Result issue(Command command) {
        Objects.requireNonNull(command, "command");
        try {
            return transactions.required(() -> issueWithinTransaction(command));
        } catch (PersistenceConflictException conflict) {
            if (conflict.code().startsWith("persistence.enterprise_session_")) {
                throw replayedChallenge();
            }
            throw conflict;
        }
    }

    private Result issueWithinTransaction(Command command) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle bundle = sessions
                .loadChallengeForUpdate(command.deviceProof().challengeId())
                .map(EnterpriseSessionPersistenceValidator::validateChallengeBundle)
                .orElseThrow(IssueEnterpriseSessionLeaseService::expiredChallenge);
        DeviceChallenge challenge = bundle.challenge();
        EnterpriseSessionChallengeBinding binding = bundle.binding();
        requirePendingContext(command, challenge, binding, now);

        VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle resolved =
                handles.resolveForLeaseForUpdate(
                        command.opaqueHandle(), binding.identitySourceRevision());
        if (!resolved.verifiedIdentityId().equals(binding.verifiedIdentityId())
                || !resolved.identitySourceRevision().equals(binding.identitySourceRevision())) {
            throw invalidHandle();
        }
        VerifiedEnterpriseIdentity identity = IssueEnterpriseSessionChallengeService
                .requireActiveIdentity(
                        identities.findVerifiedIdentityByIdForUpdate(resolved.verifiedIdentityId())
                                .orElseThrow(IssueEnterpriseSessionLeaseService::invalidHandle),
                        now);

        EnterpriseDevice device = requireLockedDevice(identity, challenge, binding);
        requireProofTime(command.deviceProof(), challenge, now);
        proofVerifier.verify(
                challenge,
                command.deviceProof(),
                new DevicePublicKey(
                        device.deviceKeyId(),
                        device.algorithm(),
                        device.publicKeyFormat(),
                        device.publicKeyEncoded()));

        List<EnterpriseUserPermission> permissionFacts = requireRequestedPermissions(
                identity, binding.requiredPermissions());
        DeviceTrustDecision trust = deviceTrust.requireTrusted(device, now);
        IssueEnterpriseSessionChallengeService.requireManagedCompliant(trust.device());
        CompatibilityEvaluator.CompatibilityDecision compatibilityDecision =
                compatibility.requireCompatible(binding.currentClientInstanceId().toString());

        String requestDigest = EnterpriseSessionDecisionDigests.leaseRequestDigest(
                new EnterpriseSessionLeaseRequestDigestMaterial(
                        EnterpriseSessionLeaseRequestDigestMaterial.SCHEMA_VERSION,
                        EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                        binding.challengeId(),
                        binding.challengeBindingDigest(),
                        binding.currentClientInstanceId(),
                        binding.audience(),
                        binding.requiredPermissions(),
                        binding.deviceKeyId(),
                        binding.correlationId()));
        Instant expiresAt = now.plus(policy.tokenTtl());
        EnterpriseSessionDecisionAssembler.PreparedDecision prepared = assembler.prepareDecision(
                new EnterpriseSessionDecisionAssembler.Material(
                        binding,
                        identity,
                        device,
                        permissionFacts,
                        trust,
                        compatibilityDecision,
                        entropy.nextUuid(),
                        now,
                        expiresAt,
                        policy.issuer(),
                        requestDigest));

        // This call is deliberately inside CentralTransactionRunner.required().
        String compactToken = tokenCodec.encode(
                prepared.claims(), signingKeys.requireCurrent());
        requireBoundedBearer(compactToken);
        String tokenDigest = AuthenticationCrypto.sha256(compactToken);
        EnterpriseSessionDecisionAssembler.LeaseOutcome outcome =
                assembler.finalizeIssuance(prepared, tokenDigest);
        EnterpriseSessionPersistenceValidator.validateLease(
                outcome.issuance(), bundle, identity, device);
        var committed = sessions.commitLeaseOutcome(
                new EnterpriseSessionPersistence.EnterpriseSessionLeaseCommit(
                        binding.recordDigest(),
                        binding.challengeBindingDigest(),
                        now,
                        EnterpriseSessionChallengeBinding.PURPOSE,
                        requestDigest,
                        outcome.issuance()));
        if (!committed.equals(outcome.issuance())) {
            throw EnterpriseAuthenticationException.internal(
                    "enterprise_session_commit_mismatch",
                    "The enterprise session lease did not commit exactly.");
        }
        return new Result(
                compactToken,
                committed.expiresAt(),
                outcome.sessionAssertionJson(),
                outcome.deviceTrustDecisionJson(),
                committed.compatibilityRevision(),
                committed.sourceDecisionDigest());
    }

    private static void requirePendingContext(
            Command command,
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding,
            Instant now) {
        if (challenge.consumedAt() != null) {
            throw replayedChallenge();
        }
        boolean exact = EnterpriseSessionChallengeBinding.PURPOSE.equals(challenge.purpose())
                && binding.currentClientInstanceId().equals(command.currentClientInstanceId())
                && binding.audience().equals(command.audience())
                && binding.requiredPermissions().equals(command.requiredPermissions())
                && binding.deviceKeyId().equals(command.deviceProof().deviceKeyId())
                && binding.correlationId().equals(command.correlationId())
                && challenge.challengeId().equals(command.deviceProof().challengeId())
                && challenge.allowedAlgorithms().contains(command.deviceProof().algorithm());
        if (!exact) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_context_mismatch",
                    "Device proof does not match the enterprise session challenge.");
        }
        if (!now.isBefore(challenge.expiresAt())) {
            throw expiredChallenge();
        }
    }

    private EnterpriseDevice requireLockedDevice(
            VerifiedEnterpriseIdentity identity,
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding) {
        EnterpriseDevice observed = devices
                .findByKeyId(identity.enterpriseId(), binding.deviceKeyId())
                .orElseThrow(IssueEnterpriseSessionLeaseService::deviceDenied);
        EnterpriseDevice locked = devices.findByIdForUpdate(observed.deviceId())
                .orElseThrow(IssueEnterpriseSessionLeaseService::deviceDenied);
        if (!locked.equals(observed)
                || !locked.enterpriseId().equals(identity.enterpriseId())
                || !locked.deviceKeyId().equals(binding.deviceKeyId())
                || !locked.publicKeyDigest().equals(challenge.expectedPublicKeyDigest())) {
            throw deviceDenied();
        }
        IssueEnterpriseSessionChallengeService.requireManagedCompliant(locked);
        return locked;
    }

    private List<EnterpriseUserPermission> requireRequestedPermissions(
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
        return facts;
    }

    private void requireProofTime(DeviceProof proof, DeviceChallenge challenge, Instant now) {
        Instant earliest = challenge.issuedAt().minus(policy.allowedClockSkew());
        Instant latest = now.plus(policy.allowedClockSkew());
        if (proof.signedAt().isBefore(earliest)
                || proof.signedAt().isAfter(latest)
                || proof.signedAt().isAfter(challenge.expiresAt().plus(policy.allowedClockSkew()))) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_proof_invalid", "Device proof time is outside the allowed window.");
        }
    }

    private static void requireBoundedBearer(String compactToken) {
        if (compactToken == null
                || compactToken.length() < MINIMUM_TOKEN_LENGTH
                || compactToken.length() > MAXIMUM_TOKEN_LENGTH
                || !compactToken.matches("^[A-Za-z0-9._~-]+$")) {
            throw EnterpriseAuthenticationException.authentication(
                    "access_token_invalid", "The enterprise session token could not be issued.");
        }
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

    private static EnterpriseAuthenticationException expiredChallenge() {
        return EnterpriseAuthenticationException.conflict(
                "device_challenge_expired", "The enterprise session challenge expired.");
    }

    private static EnterpriseAuthenticationException replayedChallenge() {
        return EnterpriseAuthenticationException.conflict(
                "device_challenge_replayed",
                "The enterprise session challenge was already used.");
    }

    public record Command(
            OpaqueVerifiedIdentityHandle opaqueHandle,
            UUID currentClientInstanceId,
            String audience,
            List<String> requiredPermissions,
            DeviceProof deviceProof,
            UUID correlationId) {
        public Command {
            Objects.requireNonNull(opaqueHandle, "opaqueHandle");
            Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
            if (!EnterpriseSessionChallengeBinding.AUDIENCE.equals(audience)) {
                throw new IllegalArgumentException("audience is unsupported");
            }
            requiredPermissions = EnterpriseSessionChallengeBinding.permissions(
                    requiredPermissions);
            Objects.requireNonNull(deviceProof, "deviceProof");
            Objects.requireNonNull(correlationId, "correlationId");
        }
    }

    public record Result(
            String accessToken,
            Instant expiresAt,
            String sessionAssertionJson,
            String deviceTrustDecisionJson,
            String compatibilityRevision,
            String sourceDecisionDigest) {
        public Result {
            requireBoundedBearer(accessToken);
            Objects.requireNonNull(expiresAt, "expiresAt");
            Objects.requireNonNull(sessionAssertionJson, "sessionAssertionJson");
            Objects.requireNonNull(deviceTrustDecisionJson, "deviceTrustDecisionJson");
            Objects.requireNonNull(compatibilityRevision, "compatibilityRevision");
            if (sourceDecisionDigest == null
                    || !sourceDecisionDigest.matches("^sha256:[a-f0-9]{64}$")) {
                throw new IllegalArgumentException(
                        "sourceDecisionDigest must be a Wire SHA-256 digest");
            }
        }

        @Override
        public String toString() {
            return "Result[accessToken=REDACTED, expiresAt=" + expiresAt
                    + ", compatibilityRevision=" + compatibilityRevision
                    + ", sourceDecisionDigest=" + sourceDecisionDigest + "]";
        }
    }
}
