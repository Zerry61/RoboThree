package com.robothree.central.admincontrol.application;

public final class AdminModelMutationException extends RuntimeException {

    private final String errorCode;
    private final int httpStatus;

    private AdminModelMutationException(String errorCode, int httpStatus, String safeSummary) {
        super(safeSummary);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public String errorCode() { return errorCode; }
    public int httpStatus() { return httpStatus; }

    public static AdminModelMutationException invalidRequest() {
        return new AdminModelMutationException("invalid_request", 400, "请求内容无效，请检查后重试。");
    }

    public static AdminModelMutationException notFound() {
        return new AdminModelMutationException("not_found", 404, "未找到该模型。");
    }

    public static AdminModelMutationException revisionConflict() {
        return new AdminModelMutationException("revision_conflict", 409, "模型已被其他操作更新，请刷新后重试。");
    }

    public static AdminModelMutationException businessRule(String summary) {
        return new AdminModelMutationException("business_rule_unavailable", 422, summary);
    }

    public static AdminModelMutationException serviceUnavailable() {
        return new AdminModelMutationException("service_unavailable", 503, "模型管理服务暂时不可用，请稍后重试。");
    }
}
