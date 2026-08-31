package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminManagedModel;
import java.time.Instant;
import java.util.UUID;

public interface AdminModelConnectionTester {
    Result test(AdminManagedModel model, UUID correlationId);

    record Result(
            String status,
            String safeReason,
            long durationMs,
            Instant testedAt,
            UUID correlationId) {}
}
