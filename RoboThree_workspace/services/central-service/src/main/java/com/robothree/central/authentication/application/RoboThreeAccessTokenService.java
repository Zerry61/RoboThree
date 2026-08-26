package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.RoboThreeAccessTokenCodec;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.credentials.port.EnterpriseSecretStore;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class RoboThreeAccessTokenService {

    private static final String REQUIRED_BOOTSTRAP_PERMISSION = "configuration.read";

    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final EnterprisePermissionRepository permissions;
    private final DeviceChallengeRepository challenges;
    private final AccessTokenIssuanceRepository issuances;
    private final EnterpriseDeviceTrustProvider deviceTrust;
    private final DeviceProofVerifier proofVerifier;
    private final CompatibilityEvaluator compatibility;
    private final RoboThreeAccessTokenCodec tokenCodec;
    private final EnterpriseSecretStore secretStore;
    private final CentralTransactionRunner transactions;
    private final AuthenticationEntropySource entropy;
    private final Clock clock;
    private final AccessTokenSecurityPolicy policy;

    public RoboThreeAccessTokenService(
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            EnterprisePermissionRepository permissions,
            DeviceChallengeRepository challenges,
            AccessTokenIssuanceRepository issuances,
            EnterpriseDeviceTrustProvider deviceTrust,
            DeviceProofVerifier proofVerifier,
            CompatibilityEvaluator compatibility,
            RoboThreeAccessTokenCodec tokenCodec,
            EnterpriseSecretStore secretStore,
            CentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            Clock clock,
            AccessTokenSecurityPolicy policy) {
        this.identities = Objects.requireNonNull(identities, "identities");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.permissions = Objects.requireNonNull(permissions, "permissions");
        this.challenges = Objects.requireNonNull(challenges, "challenges");
        this.issuances = Objects.requireNonNull(issuances, "issuances");
        this.deviceTrust = Objects.requireNonNull(deviceTrust, "deviceTrust");
        this.proofVerifier = Objects.requireNonNull(proofVerifier, "proofVerifier");
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.tokenCodec = Objects.requireNonNull(tokenCodec, "tokenCodec");
        this.secretStore = Objects.requireNonNull(secretStore, "secretStore");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public IssueAccessTokenResult issue(IssueAccessTokenCommand command) {
        Instant now = clock.instant();
        DeviceChallenge challenge = requirePendingChallenge(
                command.deviceProof().challengeId(),
                now);
        validateChallengeContext(command, challenge);

        VerifiedEnterpriseIdentity identity = IssueDeviceChallengeService.requireActiveIdentity(
                identities,
                command.verifiedIdentityId(),
                now);
        EnterpriseDevice device = requireExpectedDevice(identity, challenge);
        deviceTrust.requireTrusted(device, now);
        verifyDeviceProof(challenge, command.deviceProof(), device);

        PermissionSnapshot permissionSnapshot =
                requirePermissions(identity.enterpriseId(), identity.userId(), false);
        CompatibilityEvaluator.CompatibilityDecision compatibilityDecision =
                compatibility.requireCompatible(command.clientInstanceId());

        UUID tokenId = entropy.nextUuid();
        Instant expiresAt = now.plus(policy.tokenTtl());
        AccessTokenClaims claims = new AccessTokenClaims(
                "v1alpha1",
                policy.issuer(),
                policy.audience(),
                identity.enterpriseId(),
                identity.userId(),
                device.deviceId(),
                command.clientInstanceId(),
                tokenId,
                now,
                expiresAt,
                permissionSnapshot.permissionNames());
        String compactToken = tokenCodec.encode(
                claims,
                secretStore.resolveTokenSigningKeyHandle());
        if (compactToken == null || compactToken.length() < 32 || compactToken.length() > 8192) {
            throw EnterpriseAuthenticationException.authentication(
                    "access_token_invalid",
                    "The access token could not be issued.");
        }
        String tokenDigest = AuthenticationCrypto.sha256(compactToken);
        String requestDigest = AuthenticationCrypto.boundDigest(
                command.verifiedIdentityId().toString(),
                command.clientInstanceId(),
                command.deviceProof().challengeId().toString(),
                command.deviceProof().deviceKeyId(),
                AuthenticationCrypto.sha256(command.deviceProof().signature()),
                tokenId.toString(),
                tokenDigest);

        transactions.required(() -> {
            DeviceChallenge lockedChallenge = challenges
                    .findChallengeForUpdate(command.deviceProof().challengeId())
                    .orElseThrow(RoboThreeAccessTokenService::expiredChallenge);
            if (lockedChallenge.consumedAt() != null) {
                throw replayedChallenge();
            }
            validatePendingExpiry(lockedChallenge, now);
            validateChallengeContext(command, lockedChallenge);

            VerifiedEnterpriseIdentity lockedIdentity = identities
                    .findVerifiedIdentityByIdForUpdate(command.verifiedIdentityId())
                    .map(value -> IssueDeviceChallengeService.requireActiveIdentityValue(
                            value,
                            now))
                    .orElseThrow(RoboThreeAccessTokenService::invalidIdentity);
            if (!lockedIdentity.identityDigest().equals(identity.identityDigest())
                    || !lockedIdentity.enterpriseId().equals(identity.enterpriseId())
                    || !lockedIdentity.userId().equals(identity.userId())) {
                throw invalidIdentity();
            }

            EnterpriseDevice lockedDevice = devices.findByIdForUpdate(device.deviceId())
                    .orElseThrow(RoboThreeAccessTokenService::deniedDevice);
            deviceTrust.requireTrusted(lockedDevice, now);
            if (lockedDevice.revision() != device.revision()
                    || !lockedDevice.publicKeyDigest().equals(device.publicKeyDigest())
                    || !lockedDevice.deviceKeyId().equals(device.deviceKeyId())) {
                throw deniedDevice();
            }

            PermissionSnapshot lockedPermissions =
                    requirePermissions(identity.enterpriseId(), identity.userId(), true);
            if (!lockedPermissions.equals(permissionSnapshot)) {
                throw EnterpriseAuthenticationException.authorization(
                        "permission_denied",
                        "Enterprise permission changed during token issuance.");
            }
            CompatibilityEvaluator.CompatibilityDecision lockedCompatibility =
                    compatibility.requireCompatible(command.clientInstanceId());
            if (lockedCompatibility.revision() != compatibilityDecision.revision()) {
                throw EnterpriseAuthenticationException.authorization(
                        "compatibility_mismatch",
                        "Compatibility changed during token issuance.");
            }

            DeviceChallenge consumed = challenges.consume(
                    lockedChallenge.challengeId(),
                    now,
                    tokenId.toString(),
                    requestDigest);
            if (!requestDigest.equals(consumed.consumedRequestDigest())) {
                throw replayedChallenge();
            }
            issuances.insert(new AccessTokenIssuance(
                    tokenId,
                    tokenDigest,
                    identity.enterpriseId(),
                    identity.userId(),
                    device.deviceId(),
                    command.clientInstanceId(),
                    permissionSnapshot.permissionNames(),
                    identity.identityDigest(),
                    device.revision(),
                    permissionSnapshot.revision(),
                    now,
                    expiresAt,
                    challenge.challengeId()));
            return null;
        });

        return new IssueAccessTokenResult("Bearer", compactToken, expiresAt);
    }

    private PermissionSnapshot requirePermissions(
            String enterpriseId,
            String userId,
            boolean forUpdate) {
        List<EnterpriseUserPermission> enabled = forUpdate
                ? permissions.findEnabledForUpdate(enterpriseId, userId)
                : permissions.findEnabled(enterpriseId, userId);
        List<EnterpriseUserPermission> ordered = enabled.stream()
                .sorted(Comparator.comparing(EnterpriseUserPermission::permission))
                .toList();
        List<String> names = ordered.stream()
                .map(EnterpriseUserPermission::permission)
                .toList();
        if (!names.contains(REQUIRED_BOOTSTRAP_PERMISSION)) {
            throw EnterpriseAuthenticationException.authorization(
                    "permission_denied",
                    "The user is not allowed to read enterprise configuration.");
        }
        long revision = ordered.stream()
                .mapToLong(EnterpriseUserPermission::revision)
                .max()
                .orElseThrow();
        return new PermissionSnapshot(names, revision, ordered);
    }

    private DeviceChallenge requirePendingChallenge(UUID challengeId, Instant now) {
        DeviceChallenge challenge = challenges.findChallengeById(challengeId)
                .orElseThrow(RoboThreeAccessTokenService::expiredChallenge);
        if (challenge.consumedAt() != null) {
            throw replayedChallenge();
        }
        validatePendingExpiry(challenge, now);
        return challenge;
    }

    private EnterpriseDevice requireExpectedDevice(
            VerifiedEnterpriseIdentity identity,
            DeviceChallenge challenge) {
        if (challenge.expectedDeviceKeyId() == null) {
            throw deniedDevice();
        }
        EnterpriseDevice device = devices.findByKeyId(
                        identity.enterpriseId(),
                        challenge.expectedDeviceKeyId())
                .orElseThrow(RoboThreeAccessTokenService::deniedDevice);
        if (!device.publicKeyDigest().equals(challenge.expectedPublicKeyDigest())) {
            throw deniedDevice();
        }
        return device;
    }

    private void verifyDeviceProof(
            DeviceChallenge challenge,
            DeviceProof proof,
            EnterpriseDevice device) {
        DevicePublicKey publicKey = new DevicePublicKey(
                device.deviceKeyId(),
                device.algorithm(),
                device.publicKeyFormat(),
                device.publicKeyEncoded());
        proofVerifier.verify(challenge, proof, publicKey);
    }

    private static void validateChallengeContext(
            IssueAccessTokenCommand command,
            DeviceChallenge challenge) {
        if (!IssueDeviceChallengeService.TOKEN_ISSUANCE.equals(challenge.purpose())
                || !challenge.verifiedIdentityId().equals(command.verifiedIdentityId())
                || !challenge.clientInstanceId().equals(command.clientInstanceId())
                || !Objects.equals(challenge.expectedDeviceKeyId(), command.deviceProof().deviceKeyId())
                || !challenge.allowedAlgorithms().contains(command.deviceProof().algorithm())) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_context_mismatch",
                    "Device proof does not match the issued challenge context.");
        }
    }

    private static void validatePendingExpiry(DeviceChallenge challenge, Instant now) {
        if (!now.isBefore(challenge.expiresAt())) {
            throw expiredChallenge();
        }
    }

    private static EnterpriseAuthenticationException expiredChallenge() {
        return EnterpriseAuthenticationException.authentication(
                "device_challenge_expired",
                "Device challenge is unavailable or expired.");
    }

    private static EnterpriseAuthenticationException replayedChallenge() {
        return EnterpriseAuthenticationException.conflict(
                "device_challenge_replayed",
                "Device challenge has already been consumed.");
    }

    private static EnterpriseAuthenticationException invalidIdentity() {
        return EnterpriseAuthenticationException.authentication(
                "enterprise_identity_invalid",
                "Verified enterprise identity is unavailable.");
    }

    private static EnterpriseAuthenticationException deniedDevice() {
        return EnterpriseAuthenticationException.authorization(
                "device_access_denied",
                "The requested enterprise device is unavailable.");
    }

    public record IssueAccessTokenCommand(
            UUID verifiedIdentityId,
            String clientInstanceId,
            DeviceProof deviceProof) {

        public IssueAccessTokenCommand {
            Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
            Objects.requireNonNull(deviceProof, "deviceProof");
            if (clientInstanceId == null || clientInstanceId.isBlank()) {
                throw new IllegalArgumentException("clientInstanceId is required");
            }
            UUID.fromString(clientInstanceId);
        }
    }

    public record IssueAccessTokenResult(
            String tokenType,
            String accessToken,
            Instant expiresAt) {}

    private record PermissionSnapshot(
            List<String> permissionNames,
            long revision,
            List<EnterpriseUserPermission> rows) {

        private PermissionSnapshot {
            permissionNames = List.copyOf(permissionNames);
            rows = List.copyOf(rows);
        }
    }
}
