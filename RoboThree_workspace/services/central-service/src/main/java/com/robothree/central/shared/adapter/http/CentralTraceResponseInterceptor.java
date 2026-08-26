package com.robothree.central.shared.adapter.http;

import com.robothree.central.shared.observability.CentralTraceContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@ConditionalOnBean(CentralTraceContext.class)
@RequiredArgsConstructor
final class CentralTraceResponseInterceptor implements HandlerInterceptor {

    @NonNull
    private final CentralTraceContext traceContext;

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) {
        traceContext.writeResponseHeader(response);
        return true;
    }
}
