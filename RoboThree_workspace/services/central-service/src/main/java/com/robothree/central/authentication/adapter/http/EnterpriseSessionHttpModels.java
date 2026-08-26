package com.robothree.central.authentication.adapter.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.robothree.central.authentication.domain.DeviceProof;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class EnterpriseSessionHttpModels {

    static final String SCHEMA_VERSION = "enterprise-session.v1alpha1";

    private EnterpriseSessionHttpModels() {}

    record DeviceChallengeRequest(
            String kind,
            String schemaVersion,
            String verifiedIdentityHandle,
            UUID currentClientInstanceId,
            String audience,
            List<String> requiredPermissions,
            String deviceKeyId,
            UUID correlationId) {}

    record DeviceChallengeResponse(
            String kind,
            String schemaVersion,
            UUID challengeId,
            String nonce,
            Instant issuedAt,
            Instant expiresAt,
            String audience,
            UUID currentClientInstanceId,
            List<String> allowedAlgorithms,
            String challengeDigest) {}

    record SessionLeaseRequest(
            String kind,
            String schemaVersion,
            String verifiedIdentityHandle,
            UUID currentClientInstanceId,
            String audience,
            List<String> requiredPermissions,
            DeviceProofBody deviceProof,
            UUID correlationId) {}

    record DeviceProofBody(
            UUID challengeId,
            String deviceKeyId,
            String algorithm,
            String signature,
            Instant signedAt) {

        DeviceProof toDomain() {
            return new DeviceProof(challengeId, deviceKeyId, algorithm, signature, signedAt);
        }
    }

    record SessionLeaseResponse(
            String kind,
            String schemaVersion,
            String claimsProfile,
            String tokenType,
            String accessToken,
            Instant expiresAt,
            JsonNode sessionAssertion,
            JsonNode deviceTrustDecision,
            String compatibilityRevision,
            String sourceDecisionDigest) {

        @Override
        public String toString() {
            return "SessionLeaseResponse[accessToken=REDACTED, expiresAt=" + expiresAt
                    + ", compatibilityRevision=" + compatibilityRevision + "]";
        }
    }

    record ErrorResponse(
            String kind,
            String schemaVersion,
            String errorCode,
            String message,
            boolean retryable,
            UUID correlationId) {}
}
