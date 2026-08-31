package com.robothree.central.shared.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.shared.observability.CentralTraceContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@ConditionalOnBean(CentralTraceContext.class)
@Order(EnterpriseBearerTokenFilter.FILTER_ORDER)
@RequiredArgsConstructor
public final class EnterpriseBearerTokenFilter extends OncePerRequestFilter {

    public static final int FILTER_ORDER = Ordered.HIGHEST_PRECEDENCE + 50;
    public static final String ACCESS_TOKEN_ATTRIBUTE =
            "com.robothree.central.enterpriseAccessToken";

    @NonNull
    private final ObjectMapper objectMapper;
    @NonNull
    private final CentralTraceContext traceContext;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        if (!"GET".equals(method) && !"POST".equals(method)) return true;
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (!contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        boolean configuration = "GET".equals(method)
                && (path.equals("/v1alpha1/configuration")
                        || path.startsWith("/v1alpha1/configuration/"));
        boolean internalTrialAdminModel = "GET".equals(method)
                && path.equals("/internal-trial/v1/admin-models/default");
        boolean internalTrialAgentLifecycle = path.startsWith(
                "/internal-trial/v1/agent-lifecycle/");
        boolean modelInvocation = path.matches("^/v1alpha[12]/model-invocations$")
                ? "POST".equals(method)
                : path.matches("^/v1alpha[12]/model-invocations/[^/]+$")
                        ? "GET".equals(method)
                        : path.matches("^/v1alpha[12]/model-invocations/[^/]+/cancel$")
                                ? "POST".equals(method)
                                : path.matches("^/v1alpha[12]/model-invocations/[^/]+/events$")
                                        && "GET".equals(method);
        return !configuration && !modelInvocation && !internalTrialAdminModel
                && !internalTrialAgentLifecycle;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        try {
            List<String> authorizationHeaders =
                    Collections.list(request.getHeaders(HttpHeaders.AUTHORIZATION));
            String compactToken = EnterpriseBearerTokenExtractor.extract(
                    authorizationHeaders);
            request.setAttribute(ACCESS_TOKEN_ATTRIBUTE, compactToken);
            try {
                filterChain.doFilter(request, response);
            } finally {
                request.removeAttribute(ACCESS_TOKEN_ATTRIBUTE);
            }
        } catch (EnterpriseAuthenticationException ignored) {
            writeInvalidToken(request, response);
        }
    }

    private void writeInvalidToken(
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        traceContext.recordHttpError("access_token_invalid", false);
        traceContext.writeResponseHeader(response);
        if (request.getRequestURI().startsWith("/internal-trial/v1/agent-lifecycle/")) {
            objectMapper.writeValue(response.getOutputStream(), java.util.Map.of(
                    "contractVersion", "agent-lifecycle.v1alpha1",
                    "errorCode", "agentlifecycle.unauthorized",
                    "safeSummary", "当前身份不能执行此操作。",
                    "correlationId", safeCorrelationId(request)));
            return;
        }
        objectMapper.writeValue(response.getOutputStream(),
                GatewayErrorResponseFactory.invalidAccessToken());
    }

    private static java.util.UUID safeCorrelationId(HttpServletRequest request) {
        try {
            return java.util.UUID.fromString(
                    request.getHeader("X-RoboThree-Correlation-Id"));
        } catch (RuntimeException ignored) {
            return java.util.UUID.randomUUID();
        }
    }
}
