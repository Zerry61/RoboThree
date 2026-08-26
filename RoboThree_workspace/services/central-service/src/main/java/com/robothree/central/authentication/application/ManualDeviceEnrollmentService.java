package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class ManualDeviceEnrollmentService {

    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final DeviceEnrollmentGrantRepository enrollmentGrants;
    private final DeviceChallengeRepository challenges;
    private final DeviceProofVerifier proofVerifier;
    private final CentralTransactionRunner transactions;
    private final AuthenticationEntropySource entropy;
    private final Clock clock;
    private final AuthenticationSecurityPolicy policy;

    public ManualDeviceEnrollmentService(
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            DeviceEnrollmentGrantRepository enrollmentGrants,
            DeviceChallengeRepository challenges,
            DeviceProofVerifier proofVerifier,
            CentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            Clock clock,
            AuthenticationSecurityPolicy policy) {
        this.identities = Objects.requireNonNull(identities, "identities");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.enrollmentGrants = Objects.requireNonNull(enrollmentGrants, "enrollmentGrants");
        this.challenges = Objects.requireNonNull(challenges, "challenges");
        this.proofVerifier = Objects.requireNonNull(proofVerifier, "proofVerifier");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public EnrollDeviceResult enroll(EnrollDeviceCommand command) {
        if (!policy.manualDeviceEnrollmentEnabled()) {
            throw EnterpriseAuthenticationException.authorization(
                    "manual_device_enrollment_unavailable",
                    "Manual device enrollment is not enabled.");
        }
        Instant now = clock.instant();
        DeviceChallenge challenge = challenges
                .findChallengeById(command.deviceProof().challengeId())
                .orElseThrow(() -> EnterpriseAuthenticationException.authentication(
                        "device_challenge_expired",
                        "Device challenge is unavailable or expired."));
        validateContext(command, challenge);
        validatePendingExpiry(challenge, now);
        validatePublicKey(command.devicePublicKey(), challenge);
        proofVerifier.verify(challenge, command.deviceProof(), command.devicePublicKey());

        String codeDigest = AuthenticationCrypto.sha256(command.deviceEnrollmentCode());
        String publicKeyDigest = publicKeyDigest(command.devicePublicKey());
        String requestDigest = AuthenticationCrypto.boundDigest(
                command.verifiedIdentityId().toString(),
                codeDigest,
                command.clientInstanceId(),
                command.devicePublicKey().keyId(),
                command.devicePublicKey().algorithm(),
                command.devicePublicKey().format(),
                publicKeyDigest,
                command.deviceProof().challengeId().toString(),
                command.deviceProof().algorithm(),
                AuthenticationCrypto.sha256(command.deviceProof().signature()));

        return transactions.required(() -> enrollInTransaction(
                command,
                codeDigest,
                publicKeyDigest,
                requestDigest,
                now));
    }

    private EnrollDeviceResult enrollInTransaction(
            EnrollDeviceCommand command,
            String codeDigest,
            String publicKeyDigest,
            String requestDigest,
            Instant now) {
        DeviceChallenge current = challenges
                .findChallengeForUpdate(command.deviceProof().challengeId())
                .orElseThrow(() -> EnterpriseAuthenticationException.authentication(
                        "device_challenge_expired",
                        "Device challenge is unavailable or expired."));
        if (current.consumedAt() != null) {
            if (requestDigest.equals(current.consumedRequestDigest())) {
                EnterpriseDevice existing = devices.findById(current.consumedBy())
                        .orElseThrow(() -> EnterpriseAuthenticationException.conflict(
                                "enrollment_conflict",
                                "Enrollment result is incomplete."));
                VerifiedEnterpriseIdentity identity = identities
                        .findVerifiedIdentityById(current.verifiedIdentityId())
                        .orElseThrow(() -> EnterpriseAuthenticationException.authentication(
                                "enterprise_identity_invalid",
                                "Verified enterprise identity is unavailable."));
                return result(existing, identity, current);
            }
            throw EnterpriseAuthenticationException.conflict(
                    "device_challenge_replayed",
                    "Device challenge has already been consumed.");
        }

        validateContext(command, current);
        validatePendingExpiry(current, now);
        VerifiedEnterpriseIdentity identity = IssueDeviceChallengeService.requireActiveIdentity(
                identities,
                command.verifiedIdentityId(),
                now);
        DeviceEnrollmentGrant grant = enrollmentGrants
                .findEnrollmentGrantByCodeDigestForUpdate(codeDigest)
                .orElseThrow(IssueDeviceChallengeService::invalidEnrollmentGrant);
        IssueDeviceChallengeService.requireUsableGrant(grant, identity, now);

        if (devices.findByKeyId(identity.enterpriseId(), command.devicePublicKey().keyId()).isPresent()
                || devices.findByPublicKeyDigest(identity.enterpriseId(), publicKeyDigest).isPresent()) {
            throw EnterpriseAuthenticationException.conflict(
                    "enrollment_conflict",
                    "Device key is already registered.");
        }

        String deviceId = "device." + entropy.nextUuid();
        EnterpriseDevice device = devices.insert(new EnterpriseDevice(
                deviceId,
                identity.enterpriseId(),
                command.devicePublicKey().keyId(),
                command.devicePublicKey().format(),
                command.devicePublicKey().encodedKey(),
                publicKeyDigest,
                command.devicePublicKey().algorithm(),
                "manual_device_enrollment",
                "managed",
                "compliant",
                0,
                now,
                null,
                null));
        DeviceEnrollmentGrant consumedGrant =
                enrollmentGrants.consume(grant.enrollmentGrantId(), now);
        if (!now.equals(consumedGrant.consumedAt())) {
            throw IssueDeviceChallengeService.invalidEnrollmentGrant();
        }
        DeviceChallenge consumed =
                challenges.consume(current.challengeId(), now, deviceId, requestDigest);
        if (!requestDigest.equals(consumed.consumedRequestDigest())) {
            throw EnterpriseAuthenticationException.conflict(
                    "device_challenge_replayed",
                    "Device challenge has already been consumed.");
        }
        return result(device, identity, consumed);
    }

    private static EnrollDeviceResult result(
            EnterpriseDevice device,
            VerifiedEnterpriseIdentity identity,
            DeviceChallenge challenge) {
        return new EnrollDeviceResult(
                identity.enterpriseId(),
                identity.userId(),
                device.deviceId(),
                device.deviceKeyId(),
                challenge.clientInstanceId(),
                device.registeredAt());
    }

    private static void validateContext(
            EnrollDeviceCommand command,
            DeviceChallenge challenge) {
        if (!IssueDeviceChallengeService.DEVICE_ENROLLMENT.equals(challenge.purpose())
                || !challenge.verifiedIdentityId().equals(command.verifiedIdentityId())
                || !challenge.clientInstanceId().equals(command.clientInstanceId())
                || !challenge.allowedAlgorithms().contains(command.deviceProof().algorithm())) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_context_mismatch",
                    "Device proof does not match the issued challenge context.");
        }
    }

    private static void validatePendingExpiry(DeviceChallenge challenge, Instant now) {
        if (!now.isBefore(challenge.expiresAt())) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_challenge_expired",
                    "Device challenge is expired.");
        }
    }

    private static void validatePublicKey(
            DevicePublicKey publicKey,
            DeviceChallenge challenge) {
        if (!"ES256".equals(publicKey.algorithm())
                || !"spki_der_base64".equals(publicKey.format())
                || !publicKeyDigest(publicKey).equals(challenge.expectedPublicKeyDigest())) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_context_mismatch",
                    "Device public key does not match the issued challenge.");
        }
    }

    private static String publicKeyDigest(DevicePublicKey publicKey) {
        try {
            return AuthenticationCrypto.sha256(
                    java.util.Base64.getDecoder().decode(publicKey.encodedKey()));
        } catch (IllegalArgumentException exception) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_proof_invalid",
                    "Device public key could not be decoded.");
        }
    }

    public record EnrollDeviceCommand(
            UUID verifiedIdentityId,
            String deviceEnrollmentCode,
            String clientInstanceId,
            DevicePublicKey devicePublicKey,
            DeviceProof deviceProof) {

        public EnrollDeviceCommand {
            if (verifiedIdentityId == null
                    || devicePublicKey == null
                    || deviceProof == null) {
                throw new IllegalArgumentException(
                        "identity, public key and device proof are required");
            }
            if (deviceEnrollmentCode == null
                    || deviceEnrollmentCode.length() < 16
                    || deviceEnrollmentCode.length() > 512) {
                throw new IllegalArgumentException(
                        "deviceEnrollmentCode length is outside the Contract boundary");
            }
            if (clientInstanceId == null) {
                throw new IllegalArgumentException("clientInstanceId is required");
            }
            try {
                UUID.fromString(clientInstanceId);
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException(
                        "clientInstanceId must be a UUID",
                        exception);
            }
        }
    }

    public record EnrollDeviceResult(
            String enterpriseId,
            String userId,
            String deviceId,
            String deviceKeyId,
            String clientInstanceId,
            Instant enrolledAt) {}
}
