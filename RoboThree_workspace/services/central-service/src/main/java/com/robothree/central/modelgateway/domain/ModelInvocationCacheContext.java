package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import com.robothree.central.shared.json.CanonicalJson;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Immutable Central-side proof that a v1alpha2 invocation carries Session cache context. */
public record ModelInvocationCacheContext(
        UUID invocationId,
        UsageAuthority cacheExecutionAuthority,
        String gatewayContractVersion,
        String sessionScopeDigest,
        String cacheContextDigest,
        String contextRecordDigest,
        Instant createdAt) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public ModelInvocationCacheContext {
        Objects.requireNonNull(invocationId, "invocationId");
        Objects.requireNonNull(cacheExecutionAuthority, "cacheExecutionAuthority");
        if (cacheExecutionAuthority != UsageAuthority.CENTRAL_ENTERPRISE) {
            throw new IllegalArgumentException(
                    "Central cache context requires central_enterprise authority");
        }
        if (!"v1alpha2".equals(gatewayContractVersion)) {
            throw new IllegalArgumentException("gatewayContractVersion must be v1alpha2");
        }
        sessionScopeDigest = digest(sessionScopeDigest, "sessionScopeDigest");
        cacheContextDigest = digest(cacheContextDigest, "cacheContextDigest");
        contextRecordDigest = digest(contextRecordDigest, "contextRecordDigest");
        Objects.requireNonNull(createdAt, "createdAt");
        String expected = computeRecordDigest(
                invocationId,
                cacheExecutionAuthority,
                gatewayContractVersion,
                sessionScopeDigest,
                cacheContextDigest);
        if (!expected.equals(contextRecordDigest)) {
            throw new IllegalArgumentException("contextRecordDigest does not match context facts");
        }
    }

    public static ModelInvocationCacheContext create(
            UUID invocationId,
            String sessionScopeDigest,
            String cacheContextDigest,
            Instant createdAt) {
        return new ModelInvocationCacheContext(
                invocationId,
                UsageAuthority.CENTRAL_ENTERPRISE,
                "v1alpha2",
                sessionScopeDigest,
                cacheContextDigest,
                computeRecordDigest(
                        invocationId,
                        UsageAuthority.CENTRAL_ENTERPRISE,
                        "v1alpha2",
                        sessionScopeDigest,
                        cacheContextDigest),
                createdAt);
    }

    private static String computeRecordDigest(
            UUID invocationId,
            UsageAuthority authority,
            String contractVersion,
            String sessionScopeDigest,
            String cacheContextDigest) {
        ObjectNode value = JSON.createObjectNode();
        value.put("cacheContextDigest", cacheContextDigest);
        value.put("cacheExecutionAuthority", authority.contractValue());
        value.put("gatewayContractVersion", contractVersion);
        value.put("invocationId", invocationId.toString());
        value.put("sessionScopeDigest", sessionScopeDigest);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }
}
