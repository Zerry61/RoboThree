package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.port.ModelProviderRequestSource;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds provider request content only for the live execution node. Content is
 * never persisted; Core may replay the same accept request to re-register it.
 */
public final class TransientModelProviderRequestSource
        implements ModelProviderRequestSource {

    private final ConcurrentHashMap<String, ResolvedRequest> requests =
            new ConcurrentHashMap<>();

    public void register(
            String acceptRequestDigest,
            String canonicalProviderRequestJson) {
        Objects.requireNonNull(acceptRequestDigest, "acceptRequestDigest");
        String providerDigest = CanonicalJson.sha256(canonicalProviderRequestJson);
        ResolvedRequest proposed = new ResolvedRequest(
                providerDigest,
                canonicalProviderRequestJson);
        ResolvedRequest existing = requests.putIfAbsent(
                acceptRequestDigest,
                proposed);
        if (existing != null
                && (!existing.requestDigest().equals(proposed.requestDigest())
                        || !existing.canonicalRequestJson()
                                .equals(proposed.canonicalRequestJson()))) {
            throw ModelGatewayException.conflict(
                    "model_gateway.provider_request_conflict",
                    "The accepted request is already bound to different provider data.");
        }
    }

    @Override
    public ResolvedRequest resolve(String acceptRequestDigest) {
        ResolvedRequest request = requests.get(acceptRequestDigest);
        if (request == null) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_request_unavailable",
                    "The provider request must be replayed before execution recovery.");
        }
        return request;
    }

    public void clear(String acceptRequestDigest) {
        requests.remove(acceptRequestDigest);
    }

    public int size() {
        return requests.size();
    }
}
