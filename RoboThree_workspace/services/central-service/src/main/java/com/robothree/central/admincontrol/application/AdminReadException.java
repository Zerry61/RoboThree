package com.robothree.central.admincontrol.application;

public final class AdminReadException extends RuntimeException {

    private final String errorCode;
    private final int httpStatus;
    private final String safeSummary;
    private final boolean retryable;

    private AdminReadException(
            String errorCode,
            int httpStatus,
            String safeSummary,
            boolean retryable) {
        super(errorCode);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
        this.safeSummary = safeSummary;
        this.retryable = retryable;
    }

    public static AdminReadException invalidRequest() {
        return new AdminReadException("invalid_request", 400, "请求格式不符合管理接口要求。", false);
    }

    public static AdminReadException sessionRequired() {
        return new AdminReadException("admin_session_required", 401, "需要有效的管理会话。", false);
    }

    public static AdminReadException permissionDenied() {
        return new AdminReadException("permission_denied", 403, "当前管理身份无权查看该内容。", false);
    }

    public static AdminReadException notFound() {
        return new AdminReadException("not_found", 404, "未找到请求的管理资源。", false);
    }

    public static AdminReadException staleCursor() {
        return new AdminReadException("stale_cursor", 410, "分页游标已失效，请重新加载。", false);
    }

    public static AdminReadException businessUnavailable() {
        return new AdminReadException("business_rule_unavailable", 422, "该管理模块尚未开放。", false);
    }

    public static AdminReadException serviceUnavailable() {
        return new AdminReadException("service_unavailable", 503, "管理数据暂不可用，请稍后重试。", true);
    }

    public static AdminReadException internal() {
        return new AdminReadException("internal", 503, "管理能力暂不可用，请稍后重试。", true);
    }

    public String errorCode() {
        return errorCode;
    }

    public int httpStatus() {
        return httpStatus;
    }

    public String safeSummary() {
        return safeSummary;
    }

    public boolean retryable() {
        return retryable;
    }
}
