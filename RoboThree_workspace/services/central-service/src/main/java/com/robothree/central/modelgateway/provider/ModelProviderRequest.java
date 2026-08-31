package com.robothree.central.modelgateway.provider;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelProviderRequest(
        UUID invocationId,
        String requestDigest,
        String canonicalRequestJson,
        ModelEndpointBinding binding,
        Instant deadline,
        Duration streamIdleTimeout,
        ProviderCacheProjection cacheProjection,
        ProviderReasoningProjection reasoningProjection) {

    private static final int MAXIMUM_REQUEST_BYTES = 4_194_304;

    public ModelProviderRequest {
        Objects.requireNonNull(invocationId, "invocationId");
        Objects.requireNonNull(binding, "binding");
        Objects.requireNonNull(deadline, "deadline");
        Objects.requireNonNull(streamIdleTimeout, "streamIdleTimeout");
        Objects.requireNonNull(cacheProjection, "cacheProjection");
        Objects.requireNonNull(reasoningProjection, "reasoningProjection");
        ProviderReasoningProjection.requireProtocol(reasoningProjection, binding.protocol());
        if (streamIdleTimeout.isNegative()
                || streamIdleTimeout.isZero()
                || streamIdleTimeout.compareTo(Duration.ofMinutes(10)) > 0) {
            throw new IllegalArgumentException("streamIdleTimeout is invalid");
        }
        ObjectNode parsed =
                CanonicalJson.parseObject(canonicalRequestJson, MAXIMUM_REQUEST_BYTES);
        canonicalRequestJson = CanonicalJson.canonicalize(parsed);
        if (requestDigest == null
                || !requestDigest.equals(CanonicalJson.sha256(canonicalRequestJson))) {
            throw new IllegalArgumentException(
                    "requestDigest must match the canonical provider-neutral request");
        }
    }

    public ModelProviderRequest(
            UUID invocationId,
            String requestDigest,
            String canonicalRequestJson,
            ModelEndpointBinding binding,
            Instant deadline,
            Duration streamIdleTimeout) {
        this(
                invocationId,
                requestDigest,
                canonicalRequestJson,
                binding,
                deadline,
                streamIdleTimeout,
                ProviderCacheProjection.Disabled.of("cache_not_planned"),
                ProviderReasoningProjection.Omit.instance());
    }

    public ModelProviderRequest(
            UUID invocationId,
            String requestDigest,
            String canonicalRequestJson,
            ModelEndpointBinding binding,
            Instant deadline,
            Duration streamIdleTimeout,
            ProviderCacheProjection cacheProjection) {
        this(
                invocationId,
                requestDigest,
                canonicalRequestJson,
                binding,
                deadline,
                streamIdleTimeout,
                cacheProjection,
                ProviderReasoningProjection.Omit.instance());
    }

    public ObjectNode requestDocument() {
        return CanonicalJson.parseObject(canonicalRequestJson, MAXIMUM_REQUEST_BYTES);
    }
}
