package com.robothree.central.modelgateway.port;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public interface ModelAuthorizedHttpTransport {

    Response post(Request request);

    enum AuthorizationScheme {
        BEARER,
        ANTHROPIC_API_KEY
    }

    record Request(
            URI endpoint,
            String relativePath,
            AuthorizationScheme authorizationScheme,
            String credentialReference,
            String credentialRevision,
            Map<String, String> safeHeaders,
            byte[] body,
            Duration deadline,
            int maximumResponseHeaderBytes) {

        public Request {
            Objects.requireNonNull(endpoint, "endpoint");
            Objects.requireNonNull(authorizationScheme, "authorizationScheme");
            credentialReference = text(credentialReference, "credentialReference");
            credentialRevision = digest(credentialRevision, "credentialRevision");
            Objects.requireNonNull(deadline, "deadline");
            safeHeaders = safeHeaders == null ? Map.of() : Map.copyOf(safeHeaders);
            body = body == null ? new byte[0] : body.clone();
            if (body.length > 4_194_304) {
                throw new IllegalArgumentException("provider request body exceeds its limit");
            }
            if (maximumResponseHeaderBytes < 1
                    || maximumResponseHeaderBytes > 262_144) {
                throw new IllegalArgumentException(
                        "maximumResponseHeaderBytes is invalid");
            }
        }

        @Override
        public byte[] body() {
            return body.clone();
        }
    }

    record Response(
            int statusCode,
            Map<String, List<String>> headers,
            InputStream body)
            implements AutoCloseable {

        public Response {
            headers = Map.copyOf(headers);
            Objects.requireNonNull(body, "body");
        }

        @Override
        public void close() {
            try {
                body.close();
            } catch (java.io.IOException ignored) {
                // Closing a consumed provider response is best-effort.
            }
        }
    }
}
