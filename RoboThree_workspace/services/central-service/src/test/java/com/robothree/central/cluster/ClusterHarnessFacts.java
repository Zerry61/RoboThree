package com.robothree.central.cluster;

import java.util.UUID;

final class ClusterHarnessFacts {

    static final UUID VERIFIED_IDENTITY_ID =
            UUID.fromString("7a200000-0000-4000-8000-000000000001");
    static final String ENTERPRISE_ID = "enterprise.cluster-harness";
    static final String USER_ID = "user.cluster-harness";
    static final String DEVICE_ID = "device.cluster-harness";
    static final String CONFIGURATION_PERMISSION = "configuration.read";
    static final String MATRIX_PERMISSION = "tool.use";

    private ClusterHarnessFacts() {}
}
