package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class IssueDeviceChallengeService {

    public static final String TOKEN_ISSUANCE = "token_issuance";
    public static final String DEVICE_ENROLLMENT = "device_enrollment";

    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final DeviceEnrollmentGrantRepository enrollmentGrants;
    private final DeviceChallengeRepository challenges;
    private final EnterpriseDeviceTrustProvider deviceTrust;
    private final AuthenticationEntropySource entropy;
    private final Clock clock;
    private final AuthenticationSecurityPolicy policy;

    public IssueDeviceChallengeService(
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            DeviceEnrollmentGrantRepository enrollmentGrants,
            DeviceChallengeRepository challenges,
            EnterpriseDeviceTrustProvider deviceTrust,
            AuthenticationEntropySource entropy,
            Clock clock,
            AuthenticationSecurityPolicy policy) {
        this.identities = Objects.requireNonNull(identities, "identities");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.enrollmentGrants = Objects.requireNonNull(enrollmentGrants, "enrollmentGrants");
        this.challenges = Objects.requireNonNull(challenges, "challenges");
        this.deviceTrust = Objects.requireNonNull(deviceTrust, "deviceTrust");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public DeviceChallenge issue(IssueDeviceChallengeCommand command) {
        Instant now = clock.instant();
        VerifiedEnterpriseIdentity identity = requireActiveIdentity(
                command.verifiedIdentityId(),
                now);

        String expectedDeviceKeyId = null;
        String expectedPublicKeyDigest = null;
        if (TOKEN_ISSUANCE.equals(command.purpose())) {
            if (command.deviceKeyId() == null || command.deviceEnrollmentCode() != null) {
                throw invalidRequest();
            }
            EnterpriseDevice device = devices.findByKeyId(
                            identity.enterpriseId(),
                            command.deviceKeyId())
                    .orElseThrow(() -> EnterpriseAuthenticationException.authorization(
                            "device_access_denied",
                            "The requested enterprise device is unavailable."));
            deviceTrust.requireTrusted(device, now);
            expectedDeviceKeyId = device.deviceKeyId();
            expectedPublicKeyDigest = device.publicKeyDigest();
        } else if (DEVICE_ENROLLMENT.equals(command.purpose())) {
            if (!policy.manualDeviceEnrollmentEnabled()) {
                throw EnterpriseAuthenticationException.authorization(
                        "manual_device_enrollment_unavailable",
                        "Manual device enrollment is not enabled.");
            }
            if (command.deviceEnrollmentCode() == null
                    || command.publicKeyDigest() == null
                    || command.deviceKeyId() != null) {
                throw invalidRequest();
            }
            String codeDigest = AuthenticationCrypto.sha256(command.deviceEnrollmentCode());
            DeviceEnrollmentGrant grant = enrollmentGrants
                    .findEnrollmentGrantByCodeDigest(codeDigest)
                    .orElseThrow(IssueDeviceChallengeService::invalidEnrollmentGrant);
            requireUsableGrant(grant, identity, now);
            expectedPublicKeyDigest = command.publicKeyDigest();
        } else {
            throw invalidRequest();
        }

        UUID challengeId = entropy.nextUuid();
        String nonce = AuthenticationCrypto.base64Url(entropy.nextBytes(32));
        Instant expiresAt = now.plus(policy.challengeTtl());
        String challengeDigest = AuthenticationCrypto.boundDigest(
                challengeId.toString(),
                command.purpose(),
                identity.verifiedIdentityId().toString(),
                command.clientInstanceId(),
                expectedDeviceKeyId,
                expectedPublicKeyDigest,
                nonce,
                policy.audience(),
                now.toString(),
                expiresAt.toString());
        DeviceChallenge challenge = new DeviceChallenge(
                challengeId,
                command.purpose(),
                identity.verifiedIdentityId(),
                command.clientInstanceId(),
                expectedDeviceKeyId,
                expectedPublicKeyDigest,
                nonce,
                policy.audience(),
                List.of("ES256"),
                challengeDigest,
                now,
                expiresAt,
                null,
                null,
                null);
        return challenges.insert(challenge);
    }

    static VerifiedEnterpriseIdentity requireActiveIdentity(
            VerifiedIdentityRepository identities,
            UUID verifiedIdentityId,
            Instant now) {
        return requireActiveIdentityValue(
                identities.findVerifiedIdentityById(verifiedIdentityId)
                        .orElseThrow(() -> EnterpriseAuthenticationException.authentication(
                                "enterprise_identity_invalid",
                                "Verified enterprise identity is unavailable.")),
                now);
    }

    private VerifiedEnterpriseIdentity requireActiveIdentity(UUID identityId, Instant now) {
        return requireActiveIdentity(identities, identityId, now);
    }

    static VerifiedEnterpriseIdentity requireActiveIdentityValue(
            VerifiedEnterpriseIdentity identity,
            Instant now) {
        if (identity.disabledAt() != null || !now.isBefore(identity.expiresAt())) {
            throw EnterpriseAuthenticationException.authentication(
                    "enterprise_identity_invalid",
                    "Verified enterprise identity is disabled or expired.");
        }
        return identity;
    }

    static void requireUsableGrant(
            DeviceEnrollmentGrant grant,
            VerifiedEnterpriseIdentity identity,
            Instant now) {
        if (grant.disabledAt() != null
                || grant.consumedAt() != null
                || !now.isBefore(grant.expiresAt())
                || !grant.enterpriseId().equals(identity.enterpriseId())
                || !grant.authorizedUserId().equals(identity.userId())) {
            throw invalidEnrollmentGrant();
        }
    }

    static EnterpriseAuthenticationException invalidEnrollmentGrant() {
        return EnterpriseAuthenticationException.authorization(
                "enrollment_grant_invalid",
                "Device enrollment authorization is invalid or unavailable.");
    }

    private static EnterpriseAuthenticationException invalidRequest() {
        return EnterpriseAuthenticationException.validation(
                "contract_validation_failed",
                "Device challenge request is invalid.");
    }

    public record IssueDeviceChallengeCommand(
            String purpose,
            UUID verifiedIdentityId,
            String clientInstanceId,
            String deviceKeyId,
            String deviceEnrollmentCode,
            String publicKeyDigest) {

        public IssueDeviceChallengeCommand {
            if (purpose == null) {
                throw new IllegalArgumentException("purpose is required");
            }
            if (verifiedIdentityId == null) {
                throw new IllegalArgumentException("verifiedIdentityId is required");
            }
            if (clientInstanceId == null || clientInstanceId.isBlank()) {
                throw new IllegalArgumentException("clientInstanceId must not be blank");
            }
            try {
                UUID.fromString(clientInstanceId);
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException(
                        "clientInstanceId must be a UUID",
                        exception);
            }
            if (deviceKeyId != null
                    && (deviceKeyId.length() < 3 || deviceKeyId.length() > 160)) {
                throw new IllegalArgumentException(
                        "deviceKeyId length is outside the Contract boundary");
            }
            if (deviceEnrollmentCode != null
                    && (deviceEnrollmentCode.length() < 16
                            || deviceEnrollmentCode.length() > 512)) {
                throw new IllegalArgumentException(
                        "deviceEnrollmentCode length is outside the Contract boundary");
            }
            if (publicKeyDigest != null
                    && !publicKeyDigest.matches("^[a-f0-9]{64}$")) {
                throw new IllegalArgumentException(
                        "publicKeyDigest must be a lowercase SHA-256 digest");
            }
        }
    }
}
