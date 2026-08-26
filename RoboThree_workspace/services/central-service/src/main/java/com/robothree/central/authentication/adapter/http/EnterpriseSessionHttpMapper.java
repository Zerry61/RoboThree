package com.robothree.central.authentication.adapter.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.robothree.central.authentication.application.IssueEnterpriseSessionChallengeService;
import com.robothree.central.authentication.application.IssueEnterpriseSessionLeaseService;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import java.util.Objects;

final class EnterpriseSessionHttpMapper {

    private static final String CHALLENGE_REQUEST_KIND =
            "enterprise_session_device_challenge_request";
    private static final String CHALLENGE_RESPONSE_KIND =
            "enterprise_session_device_challenge";
    private static final String LEASE_REQUEST_KIND = "enterprise_session_lease_request";
    private static final String LEASE_RESPONSE_KIND = "enterprise_session_lease_result";

    private final ObjectMapper objectMapper;

    EnterpriseSessionHttpMapper(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper")
                .copy()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        this.objectMapper.getFactory().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION.mappedFeature());
    }

    EnterpriseSessionHttpModels.DeviceChallengeRequest parseChallengeRequest(byte[] body) {
        return readStrict(body, EnterpriseSessionHttpModels.DeviceChallengeRequest.class);
    }

    EnterpriseSessionHttpModels.SessionLeaseRequest parseLeaseRequest(byte[] body) {
        return readStrict(body, EnterpriseSessionHttpModels.SessionLeaseRequest.class);
    }

    IssueEnterpriseSessionChallengeService.Command challengeCommand(
            EnterpriseSessionHttpModels.DeviceChallengeRequest request) {
        requireKindVersion(
                request.kind(), request.schemaVersion(), CHALLENGE_REQUEST_KIND);
        return new IssueEnterpriseSessionChallengeService.Command(
                new OpaqueVerifiedIdentityHandle(request.verifiedIdentityHandle()),
                request.currentClientInstanceId(),
                request.audience(),
                request.requiredPermissions(),
                request.deviceKeyId(),
                request.correlationId());
    }

    EnterpriseSessionHttpModels.DeviceChallengeResponse challengeResponse(
            IssueEnterpriseSessionChallengeService.Result result) {
        return new EnterpriseSessionHttpModels.DeviceChallengeResponse(
                CHALLENGE_RESPONSE_KIND,
                EnterpriseSessionHttpModels.SCHEMA_VERSION,
                result.challengeId(),
                result.nonce(),
                result.issuedAt(),
                result.expiresAt(),
                result.audience(),
                result.currentClientInstanceId(),
                result.allowedAlgorithms(),
                result.challengeDigest());
    }

    IssueEnterpriseSessionLeaseService.Command leaseCommand(
            EnterpriseSessionHttpModels.SessionLeaseRequest request) {
        requireKindVersion(request.kind(), request.schemaVersion(), LEASE_REQUEST_KIND);
        Objects.requireNonNull(request.deviceProof(), "deviceProof");
        return new IssueEnterpriseSessionLeaseService.Command(
                new OpaqueVerifiedIdentityHandle(request.verifiedIdentityHandle()),
                request.currentClientInstanceId(),
                request.audience(),
                request.requiredPermissions(),
                request.deviceProof().toDomain(),
                request.correlationId());
    }

    EnterpriseSessionHttpModels.SessionLeaseResponse leaseResponse(
            IssueEnterpriseSessionLeaseService.Result result) {
        return new EnterpriseSessionHttpModels.SessionLeaseResponse(
                LEASE_RESPONSE_KIND,
                EnterpriseSessionHttpModels.SCHEMA_VERSION,
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                "Bearer",
                result.accessToken(),
                result.expiresAt(),
                parseCanonical(result.sessionAssertionJson()),
                parseCanonical(result.deviceTrustDecisionJson()),
                result.compatibilityRevision(),
                result.sourceDecisionDigest());
    }

    private JsonNode parseCanonical(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "validated Enterprise Session material could not be projected", exception);
        }
    }

    private <T> T readStrict(byte[] body, Class<T> type) {
        Objects.requireNonNull(body, "body");
        try {
            return objectMapper.readValue(body, type);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Enterprise Session request is invalid", exception);
        }
    }

    private static void requireKindVersion(
            String kind,
            String schemaVersion,
            String expectedKind) {
        if (!expectedKind.equals(kind)
                || !EnterpriseSessionHttpModels.SCHEMA_VERSION.equals(schemaVersion)) {
            throw new IllegalArgumentException("Enterprise Session request kind is unsupported");
        }
    }
}
