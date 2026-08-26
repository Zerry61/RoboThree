package com.robothree.central.shared.observability;

public enum CentralObservedOperation {
    ISSUE_DEVICE_CHALLENGE("robothree.central.application.issue-device-challenge"),
    ENROLL_DEVICE("robothree.central.application.enroll-device"),
    ISSUE_ACCESS_TOKEN("robothree.central.application.issue-access-token"),
    READ_CONFIGURATION("robothree.central.application.read-configuration"),
    READ_PACKAGE("robothree.central.application.read-package"),
    ACCEPT_MODEL_INVOCATION("robothree.central.application.accept-model-invocation"),
    READ_MODEL_INVOCATION("robothree.central.application.read-model-invocation"),
    CANCEL_MODEL_INVOCATION("robothree.central.application.cancel-model-invocation"),
    STREAM_MODEL_INVOCATION("robothree.central.application.stream-model-invocation"),
    JDBC_TRANSACTION("robothree.central.jdbc.transaction");

    private final String observationName;

    CentralObservedOperation(String observationName) {
        this.observationName = observationName;
    }

    public String observationName() {
        return observationName;
    }
}
