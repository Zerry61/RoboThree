package com.robothree.central.modelgateway.adapter.http;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import com.robothree.central.modelgateway.port.ModelOutboundEndpointPolicy;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class JdkModelAuthorizedHttpTransport
        implements ModelAuthorizedHttpTransport {

    private static final Duration RESPONSE_START_TIMEOUT = Duration.ofSeconds(90);
    private static final Set<String> SAFE_HEADER_NAMES = Set.of(
            "anthropic-version",
            "traceparent",
            "tracestate");
    private static final Pattern TRACE_PARENT = Pattern.compile(
            "^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$");

    private final HttpClient client;
    private final ModelCredentialMaterialSource credentialSource;
    private final ModelOutboundEndpointPolicy endpointPolicy;

    public JdkModelAuthorizedHttpTransport(
            HttpClient client,
            ModelCredentialMaterialSource credentialSource,
            ModelOutboundEndpointPolicy endpointPolicy) {
        this.client = Objects.requireNonNull(client, "client");
        this.credentialSource =
                Objects.requireNonNull(credentialSource, "credentialSource");
        this.endpointPolicy = Objects.requireNonNull(endpointPolicy, "endpointPolicy");
        if (client.followRedirects() != HttpClient.Redirect.NEVER) {
            throw new IllegalArgumentException("model transport must disable redirects");
        }
    }

    @Override
    public Response post(Request request) {
        Objects.requireNonNull(request, "request");
        URI target = resolve(request.endpoint(), request.relativePath());
        endpointPolicy.validate(target);
        validateSafeHeaders(request.safeHeaders());

        char[] material = credentialSource.resolve(
                request.credentialReference(),
                request.credentialRevision());
        requireCredentialMaterial(material);
        try {
            String credential = new String(material);
            HttpRequest.Builder builder = HttpRequest.newBuilder(target)
                    .timeout(responseStartTimeout(request.deadline()))
                    .header("Accept", "text/event-stream")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(request.body()));
            request.safeHeaders().forEach(builder::header);
            switch (request.authorizationScheme()) {
                case BEARER -> builder.header("Authorization", "Bearer " + credential);
                case ANTHROPIC_API_KEY -> builder.header("x-api-key", credential);
            }
            java.net.http.HttpResponse<java.io.InputStream> response =
                    client.send(builder.build(), BodyHandlers.ofInputStream());
            InputStream responseBody = response.body();
            try {
                enforceHeaderLimit(
                        response.headers().map(),
                        request.maximumResponseHeaderBytes());
            } catch (RuntimeException exception) {
                close(responseBody);
                throw exception;
            }
            return new Response(
                    response.statusCode(),
                    response.headers().map(),
                    responseBody);
        } catch (java.net.http.HttpTimeoutException exception) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_request_timeout",
                    "The model provider request timed out.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_cancelled",
                    "The model provider request was cancelled.");
        } catch (IOException exception) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_transport_failed",
                    "The model provider transport failed.");
        } finally {
            Arrays.fill(material, '\0');
        }
    }

    private static URI resolve(URI endpoint, String relativePath) {
        if (relativePath == null
                || relativePath.isBlank()
                || relativePath.startsWith("/")
                || relativePath.contains("..")
                || relativePath.indexOf('%') >= 0
                || relativePath.indexOf('\\') >= 0
                || relativePath.contains("?")
                || relativePath.contains("#")) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_route_invalid",
                    "The model provider route is invalid.");
        }
        String base = endpoint.toString();
        return URI.create(base.endsWith("/") ? base : base + "/").resolve(relativePath);
    }

    static Duration responseStartTimeout(Duration deadline) {
        if (deadline == null
                || deadline.isNegative()
                || deadline.isZero()
                || deadline.compareTo(Duration.ofMinutes(30)) > 0) {
            throw new IllegalArgumentException("provider deadline is invalid");
        }
        return deadline.compareTo(RESPONSE_START_TIMEOUT) < 0
                ? deadline
                : RESPONSE_START_TIMEOUT;
    }

    private static void validateSafeHeaders(Map<String, String> headers) {
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String name = entry.getKey();
            String normalized = name == null
                    ? ""
                    : name.toLowerCase(java.util.Locale.ROOT);
            String value = entry.getValue();
            if (name == null
                    || name.isBlank()
                    || !SAFE_HEADER_NAMES.contains(normalized)
                    || value == null
                    || value.isBlank()
                    || value.length() > 512
                    || value.indexOf('\r') >= 0
                    || value.indexOf('\n') >= 0
                    || value.chars().anyMatch(character ->
                            character < 0x20 || character > 0x7e)
                    || ("traceparent".equals(normalized)
                            && !TRACE_PARENT.matcher(value).matches())
                    || ("anthropic-version".equals(normalized)
                            && !value.matches("^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"))) {
                throw ModelGatewayException.validation(
                        "model_gateway.provider_header_invalid",
                        "The model provider header is invalid.");
            }
        }
    }

    private static void requireCredentialMaterial(char[] material) {
        if (material == null || material.length == 0 || material.length > 16_384) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.credential_unavailable",
                    "The model provider credential is unavailable.");
        }
        for (char character : material) {
            if (character < 0x21 || character > 0x7e) {
                Arrays.fill(material, '\0');
                throw ModelGatewayException.unavailable(
                        "model_gateway.credential_unavailable",
                        "The model provider credential is unavailable.");
            }
        }
    }

    private static void close(InputStream input) {
        try {
            input.close();
        } catch (IOException ignored) {
            // Closing a rejected provider response is best-effort.
        }
    }

    private static void enforceHeaderLimit(
            Map<String, List<String>> headers,
            int maximumBytes) {
        long bytes = headers.entrySet().stream()
                .mapToLong(entry -> entry.getKey().getBytes(StandardCharsets.UTF_8).length
                        + entry.getValue().stream()
                                .mapToLong(value -> value
                                        .getBytes(StandardCharsets.UTF_8).length)
                                .sum())
                .sum();
        if (bytes > maximumBytes) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_headers_oversized",
                    "The model provider headers exceeded their limit.");
        }
    }
}
