package com.robothree.central.shared.observability;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import java.util.regex.Pattern;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public final class CentralTraceContext {

    public static final String TRACE_ID_HEADER = "X-RoboThree-Trace-Id";
    private static final Pattern TRACE_ID = Pattern.compile("^[0-9a-f]{32}$");
    private static final Pattern ERROR_CODE = Pattern.compile("^[a-z][a-z0-9_]{0,63}$");

    @NonNull
    private final Tracer tracer;

    public Optional<String> currentTraceId() {
        Span span = tracer.currentSpan();
        if (span == null || span.isNoop() || span.context() == null) {
            return Optional.empty();
        }
        String traceId = span.context().traceId();
        if (traceId == null || !TRACE_ID.matcher(traceId).matches()) {
            return Optional.empty();
        }
        return Optional.of(traceId);
    }

    public void writeResponseHeader(HttpServletResponse response) {
        currentTraceId().ifPresent(traceId -> response.setHeader(TRACE_ID_HEADER, traceId));
    }

    public void recordHttpError(String errorCode, boolean retryable) {
        Span span = tracer.currentSpan();
        if (span == null || span.isNoop()) {
            return;
        }
        String safeErrorCode = errorCode != null && ERROR_CODE.matcher(errorCode).matches()
                ? errorCode
                : "internal_error";
        span.tag("robothree.error_code", safeErrorCode);
        span.tag("robothree.retryable", Boolean.toString(retryable));
    }

    public static CentralTraceContext noop() {
        return new CentralTraceContext(Tracer.NOOP);
    }
}
