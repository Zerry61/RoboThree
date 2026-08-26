package com.robothree.central.modelgateway.domain;

public enum ModelInvocationStatus {
    ACCEPTED("accepted"),
    RUNNING("running"),
    COMPLETED("completed"),
    FAILED("failed"),
    CANCELLED("cancelled"),
    TIMED_OUT("timed_out"),
    UNCERTAIN("uncertain");

    private final String contractValue;

    ModelInvocationStatus(String contractValue) {
        this.contractValue = contractValue;
    }

    public String contractValue() {
        return contractValue;
    }

    public boolean isTerminal() {
        return this == COMPLETED
                || this == FAILED
                || this == CANCELLED
                || this == TIMED_OUT
                || this == UNCERTAIN;
    }

    public static ModelInvocationStatus fromContractValue(String value) {
        for (ModelInvocationStatus status : values()) {
            if (status.contractValue.equals(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("unknown model invocation status");
    }
}
