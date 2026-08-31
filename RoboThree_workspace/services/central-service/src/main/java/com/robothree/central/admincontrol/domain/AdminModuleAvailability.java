package com.robothree.central.admincontrol.domain;

public enum AdminModuleAvailability {
    READY("ready"),
    PARTIAL("partial"),
    UNAVAILABLE("unavailable"),
    GATED("gated");

    private final String wireValue;

    AdminModuleAvailability(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
