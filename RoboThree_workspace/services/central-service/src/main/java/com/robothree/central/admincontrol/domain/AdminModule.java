package com.robothree.central.admincontrol.domain;

public enum AdminModule {
    MODELS("models", "admin.model.read"),
    ROBOTS("robots", "admin.robot.read"),
    SKILLS("skills", "admin.skill.read"),
    TOOLS("tools", "admin.tool.read"),
    KNOWLEDGE("knowledge", "admin.knowledge.read"),
    SYSTEM("system", "admin.system.audit.read");

    private final String wireValue;
    private final String readCapability;

    AdminModule(String wireValue, String readCapability) {
        this.wireValue = wireValue;
        this.readCapability = readCapability;
    }

    public String wireValue() {
        return wireValue;
    }

    public String readCapability() {
        return readCapability;
    }
}
