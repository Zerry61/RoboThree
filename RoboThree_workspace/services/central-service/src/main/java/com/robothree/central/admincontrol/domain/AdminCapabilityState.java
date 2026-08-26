package com.robothree.central.admincontrol.domain;

public enum AdminCapabilityState {
    READY("ready"),
    UNAVAILABLE("unavailable"),
    GATED("gated"),
    PARTIAL("partial");

    private final String wireValue;

    AdminCapabilityState(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
