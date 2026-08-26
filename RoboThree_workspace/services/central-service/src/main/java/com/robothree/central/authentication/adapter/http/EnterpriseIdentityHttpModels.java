package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class EnterpriseIdentityHttpModels {

    private EnterpriseIdentityHttpModels() {}

    record IssueDeviceChallengeRequest(
            String type,
            String contractVersion,
            String purpose,
            UUID verifiedIdentityId,
            String clientInstanceId,
            String deviceKeyId,
            String deviceEnrollmentCode,
            String publicKeyDigest) {}

    record DeviceChallengeResponse(
            String type,
            String contractVersion,
            UUID challengeId,
            String nonce,
            Instant issuedAt,
            Instant expiresAt,
            String audience,
            String clientInstanceId,
            List<String> allowedAlgorithms) {

        static DeviceChallengeResponse from(DeviceChallenge challenge) {
            return new DeviceChallengeResponse(
                    "device_challenge",
                    "v1alpha1",
                    challenge.challengeId(),
                    challenge.nonce(),
                    challenge.issuedAt(),
                    challenge.expiresAt(),
                    challenge.audience(),
                    challenge.clientInstanceId(),
                    challenge.allowedAlgorithms());
        }
    }

    record EnrollDeviceRequest(
            String type,
            String contractVersion,
            UUID verifiedIdentityId,
            String deviceEnrollmentCode,
            String clientInstanceId,
            DevicePublicKeyBody devicePublicKey,
            DeviceProofBody deviceProof) {}

    record DevicePublicKeyBody(
            String keyId,
            String algorithm,
            String format,
            String encodedKey) {

        DevicePublicKey toDomain() {
            return new DevicePublicKey(keyId, algorithm, format, encodedKey);
        }
    }

    record DeviceProofBody(
            UUID challengeId,
            String deviceKeyId,
            String algorithm,
            String signature,
            Instant signedAt) {

        DeviceProof toDomain() {
            return new DeviceProof(
                    challengeId,
                    deviceKeyId,
                    algorithm,
                    signature,
                    signedAt);
        }
    }

    record EnrollDeviceResponse(
            String type,
            String contractVersion,
            String enterpriseId,
            String userId,
            String deviceId,
            String deviceKeyId,
            String clientInstanceId,
            Instant enrolledAt) {

        static EnrollDeviceResponse from(
                ManualDeviceEnrollmentService.EnrollDeviceResult result) {
            return new EnrollDeviceResponse(
                    "enroll_device_result",
                    "v1alpha1",
                    result.enterpriseId(),
                    result.userId(),
                    result.deviceId(),
                    result.deviceKeyId(),
                    result.clientInstanceId(),
                    result.enrolledAt());
        }
    }

}
