package com.robothree.central.modelgateway.port;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;

public interface ModelProviderRequestSource {

    ResolvedRequest resolve(String requestDigest);

    record ResolvedRequest(
            String requestDigest,
            String canonicalRequestJson,
            ProviderReasoningProjection reasoningProjection) {

        private static final int MAXIMUM_REQUEST_BYTES = 4_194_304;

        public ResolvedRequest {
            ObjectNode parsed = CanonicalJson.parseObject(
                    canonicalRequestJson,
                    MAXIMUM_REQUEST_BYTES);
            canonicalRequestJson = CanonicalJson.canonicalize(parsed);
            String actualDigest = CanonicalJson.sha256(canonicalRequestJson);
            if (requestDigest == null || !requestDigest.equals(actualDigest)) {
                throw new IllegalArgumentException(
                        "requestDigest must match the canonical request");
            }
            if (reasoningProjection == null) {
                throw new NullPointerException("reasoningProjection");
            }
        }

        public ResolvedRequest(String requestDigest, String canonicalRequestJson) {
            this(
                    requestDigest,
                    canonicalRequestJson,
                    ProviderReasoningProjection.Omit.instance());
        }

        @Override
        public String toString() {
            return "ResolvedRequest[requestDigest=" + requestDigest + ",content=REDACTED]";
        }
    }
}
