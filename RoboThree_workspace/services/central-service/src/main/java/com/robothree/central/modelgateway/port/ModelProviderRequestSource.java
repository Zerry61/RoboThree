package com.robothree.central.modelgateway.port;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;

public interface ModelProviderRequestSource {

    ResolvedRequest resolve(String requestDigest);

    record ResolvedRequest(
            String requestDigest,
            String canonicalRequestJson) {

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
        }

        @Override
        public String toString() {
            return "ResolvedRequest[requestDigest=" + requestDigest + ",content=REDACTED]";
        }
    }
}
