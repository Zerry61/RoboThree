package com.robothree.central.modelgateway.adapter.http;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelOutboundEndpointPolicy;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

public final class StrictModelOutboundEndpointPolicy
        implements ModelOutboundEndpointPolicy {

    private final Set<String> allowedHosts;
    private final AddressResolver addressResolver;
    private final boolean allowHttpLoopbackForTests;

    public StrictModelOutboundEndpointPolicy(Set<String> allowedHosts) {
        this(allowedHosts, InetAddress::getAllByName, false);
    }

    public StrictModelOutboundEndpointPolicy(
            Set<String> allowedHosts,
            AddressResolver addressResolver,
            boolean allowHttpLoopbackForTests) {
        this.allowedHosts = allowedHosts.stream()
                .map(host -> host.toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        this.addressResolver = Objects.requireNonNull(addressResolver, "addressResolver");
        this.allowHttpLoopbackForTests = allowHttpLoopbackForTests;
    }

    @Override
    public void validate(URI endpoint) {
        Objects.requireNonNull(endpoint, "endpoint");
        String host = endpoint.getHost();
        boolean testLoopback = allowHttpLoopbackForTests
                && "http".equalsIgnoreCase(endpoint.getScheme())
                && isLoopbackHost(host);
        if ((!testLoopback && !"https".equalsIgnoreCase(endpoint.getScheme()))
                || host == null
                || endpoint.getUserInfo() != null
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null
                || !endpoint.normalize().equals(endpoint)
                || endpoint.toString().length() > 1000
                || !allowedHosts.contains(host.toLowerCase(Locale.ROOT))) {
            throw invalid();
        }
        InetAddress[] addresses;
        try {
            addresses = addressResolver.resolve(host);
        } catch (UnknownHostException exception) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.endpoint_resolution_failed",
                    "The model endpoint could not be resolved.");
        }
        if (addresses.length == 0) {
            throw invalid();
        }
        for (InetAddress address : addresses) {
            if (!testLoopback && isRestricted(address)) {
                throw invalid();
            }
            if (testLoopback && !address.isLoopbackAddress()) {
                throw invalid();
            }
        }
    }

    private static boolean isRestricted(InetAddress address) {
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress();
    }

    private static boolean isLoopbackHost(String host) {
        return "127.0.0.1".equals(host) || "::1".equals(host) || "localhost".equals(host);
    }

    private static ModelGatewayException invalid() {
        return ModelGatewayException.validation(
                "model_gateway.endpoint_not_allowed",
                "The model endpoint is not allowed.");
    }

    @FunctionalInterface
    public interface AddressResolver {

        InetAddress[] resolve(String host) throws UnknownHostException;
    }
}
