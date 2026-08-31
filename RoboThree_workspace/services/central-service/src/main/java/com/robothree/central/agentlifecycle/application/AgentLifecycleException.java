package com.robothree.central.agentlifecycle.application;

public final class AgentLifecycleException extends RuntimeException {
    private final String code;

    public AgentLifecycleException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static AgentLifecycleException invalid() {
        return new AgentLifecycleException("agentlifecycle.invalid_request", "请求内容无效。");
    }

    public static AgentLifecycleException unauthorized() {
        return new AgentLifecycleException("agentlifecycle.unauthorized", "当前身份不能执行此操作。");
    }

    public static AgentLifecycleException notFound() {
        return new AgentLifecycleException("agentlifecycle.not_found", "机器人或审核记录不存在。");
    }

    public static AgentLifecycleException conflict() {
        return new AgentLifecycleException("agentlifecycle.revision_conflict", "数据已更新，请刷新后重试。");
    }

    public static AgentLifecycleException reserved() {
        return new AgentLifecycleException("agentlifecycle.robot_id_reserved", "系统通用机器人不可编辑或发布。");
    }

    public static AgentLifecycleException incomplete() {
        return new AgentLifecycleException("agentlifecycle.draft_incomplete", "请先补充简介、行为与规则。");
    }

    public static AgentLifecycleException testRequired() {
        return new AgentLifecycleException("agentlifecycle.test_required", "当前保存版本需要先通过测试。");
    }

    public static AgentLifecycleException resourceUnavailable() {
        return new AgentLifecycleException("agentlifecycle.resource_unavailable", "机器人引用的资源当前不可用。");
    }

    public static AgentLifecycleException submissionConflict() {
        return new AgentLifecycleException("agentlifecycle.submission_conflict", "该机器人已有待审核版本。");
    }

    public static AgentLifecycleException avatarInvalid() {
        return new AgentLifecycleException("agentlifecycle.avatar_invalid", "头像文件无效或超过安全限制。");
    }
}
