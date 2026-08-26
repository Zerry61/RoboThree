package com.robothree.central.modelgateway.development;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelProviderRequestSource;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class FixedSyntheticModelProviderRequestSource
        implements ModelProviderRequestSource {

    private static final int MAXIMUM_REQUEST_BYTES = 4_194_304;

    private final Map<String, ResolvedRequest> requests;

    public FixedSyntheticModelProviderRequestSource(
            List<String> providerNeutralRequests) {
        Objects.requireNonNull(providerNeutralRequests, "providerNeutralRequests");
        Map<String, ResolvedRequest> byDigest = new HashMap<>();
        for (String request : providerNeutralRequests) {
            ObjectNode parsed = CanonicalJson.parseObject(
                    request,
                    MAXIMUM_REQUEST_BYTES);
            String canonical = CanonicalJson.canonicalize(parsed);
            String digest = CanonicalJson.sha256(canonical);
            ResolvedRequest resolved = new ResolvedRequest(digest, canonical);
            if (byDigest.putIfAbsent(digest, resolved) != null) {
                throw new IllegalArgumentException(
                        "synthetic provider request digest must be unique");
            }
        }
        this.requests = Map.copyOf(byDigest);
    }

    @Override
    public ResolvedRequest resolve(String requestDigest) {
        ResolvedRequest request = requests.get(requestDigest);
        if (request == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_request_missing",
                    "The exact synthetic provider request is unavailable.");
        }
        return request;
    }
}
