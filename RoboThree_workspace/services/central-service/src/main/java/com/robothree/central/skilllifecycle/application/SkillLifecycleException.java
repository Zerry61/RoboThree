package com.robothree.central.skilllifecycle.application;

public final class SkillLifecycleException extends RuntimeException {
    private final String code;

    public SkillLifecycleException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static SkillLifecycleException invalid() {
        return new SkillLifecycleException(
                "skilllifecycle.invalid_request", "技能请求内容无效。");
    }

    public static SkillLifecycleException notFound() {
        return new SkillLifecycleException(
                "skilllifecycle.not_found", "技能或审核记录不存在。");
    }

    public static SkillLifecycleException unauthorized() {
        return new SkillLifecycleException(
                "skilllifecycle.unauthorized", "当前身份不能执行此技能操作。");
    }

    public static SkillLifecycleException conflict() {
        return new SkillLifecycleException(
                "skilllifecycle.revision_conflict", "技能数据已更新，请刷新后重试。");
    }

    public static SkillLifecycleException packageInvalid() {
        return new SkillLifecycleException(
                "skilllifecycle.package_invalid", "技能包未通过安全校验。");
    }

    public static SkillLifecycleException testRequired() {
        return new SkillLifecycleException(
                "skilllifecycle.test_required", "当前技能版本需要先通过测试。");
    }

    public static SkillLifecycleException submissionConflict() {
        return new SkillLifecycleException(
                "skilllifecycle.submission_conflict", "该技能已有待审核版本。");
    }

    public static SkillLifecycleException releaseConflict() {
        return new SkillLifecycleException(
                "skilllifecycle.release_conflict", "该技能版本已经发布。");
    }
}
