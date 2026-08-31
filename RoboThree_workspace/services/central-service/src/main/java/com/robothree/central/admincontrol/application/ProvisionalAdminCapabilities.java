package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminCapability;
import com.robothree.central.admincontrol.domain.AdminCapabilitySource;
import com.robothree.central.admincontrol.domain.AdminCapabilityState;
import java.util.List;

public final class ProvisionalAdminCapabilities {

    public static final String REVISION = "aapi02-dev-capabilities-v1";

    private ProvisionalAdminCapabilities() {}

    public static List<AdminCapability> testOnlyCapabilities() {
        return List.of(
                ready("admin.knowledge.read", "知识管理查看"),
                gated("admin.knowledge.write", "知识管理操作"),
                ready("admin.model.read", "模型管理查看"),
                ready("admin.model.write", "模型管理操作"),
                ready("admin.robot.read", "机器人管理查看"),
                ready("admin.robot.write", "机器人发布审核"),
                ready("admin.skill.read", "技能管理查看"),
                gated("admin.skill.write", "技能管理操作"),
                gated("admin.system.audit.export", "审计日志导出"),
                ready("admin.system.audit.read", "审计日志查看"),
                ready("admin.system.feedback.read", "反馈管理查看"),
                gated("admin.system.feedback.write", "反馈管理操作"),
                ready("admin.system.users.read", "用户与权限查看"),
                gated("admin.system.users.write", "用户与权限操作"),
                ready("admin.tool.read", "工具管理查看"),
                gated("admin.tool.write", "工具管理操作"));
    }

    private static AdminCapability ready(String key, String label) {
        return new AdminCapability(
                key,
                AdminCapabilityState.READY,
                label,
                "测试管理员具备该只读入口能力；真实后端仍待后续批次接入。",
                AdminCapabilitySource.TEST_ONLY);
    }

    private static AdminCapability gated(String key, String label) {
        return new AdminCapability(
                key,
                AdminCapabilityState.GATED,
                label,
                "操作能力待接入；不得展示业务成功结果。",
                AdminCapabilitySource.TEST_ONLY);
    }
}
