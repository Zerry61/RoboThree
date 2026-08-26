package com.robothree.central.authentication.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@ConditionalOnProperty(
        name = "robothree.enterprise-session.enabled",
        havingValue = "true")
public final class EnterpriseSessionRequestSizeFilter extends OncePerRequestFilter {

    private static final int CHALLENGE_LIMIT = 32 * 1024;
    private static final int LEASE_LIMIT = 64 * 1024;
    private final ObjectMapper objectMapper;

    public EnterpriseSessionRequestSizeFilter(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return limit(request) == 0;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        int limit = limit(request);
        if (request.getContentLengthLong() > limit) {
            writeTooLarge(response);
            return;
        }
        try {
            filterChain.doFilter(new LimitedRequest(request, limit), response);
        } catch (RequestBodyTooLargeException exception) {
            if (!response.isCommitted()) {
                response.reset();
                writeTooLarge(response);
                return;
            }
            throw exception;
        }
    }

    private void writeTooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(
                response.getOutputStream(),
                new EnterpriseSessionHttpModels.ErrorResponse(
                        "enterprise_session_error",
                        EnterpriseSessionHttpModels.SCHEMA_VERSION,
                        "internal",
                        "The Enterprise Session request is invalid.",
                        false,
                        UUID.randomUUID()));
    }

    private static int limit(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) return 0;
        return switch (request.getRequestURI()) {
            case "/enterprise-session/v1alpha1/device-challenges" -> CHALLENGE_LIMIT;
            case "/enterprise-session/v1alpha1/session-leases" -> LEASE_LIMIT;
            default -> 0;
        };
    }

    static final class RequestBodyTooLargeException extends RuntimeException {}

    private static final class LimitedRequest extends HttpServletRequestWrapper {

        private final int limit;

        private LimitedRequest(HttpServletRequest request, int limit) {
            super(request);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            return new LimitedServletInputStream(super.getInputStream(), limit);
        }
    }

    private static final class LimitedServletInputStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private final int limit;
        private int count;

        private LimitedServletInputStream(ServletInputStream delegate, int limit) {
            this.delegate = delegate;
            this.limit = limit;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value >= 0 && ++count > limit) throw new RequestBodyTooLargeException();
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            int value = delegate.read(bytes, offset, Math.min(length, limit - count + 1));
            if (value > 0 && (count += value) > limit) throw new RequestBodyTooLargeException();
            return value;
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(jakarta.servlet.ReadListener readListener) {
            delegate.setReadListener(readListener);
        }
    }
}
