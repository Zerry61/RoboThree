package com.robothree.central.admincontrol.domain;

public enum AdminCapabilitySource {
    TEST_ONLY("test-only"),
    PRODUCTION("production");

    private final String wireValue;

    AdminCapabilitySource(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
