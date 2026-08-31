package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminCapability;
import com.robothree.central.admincontrol.domain.AdminCapabilityProjection;
import com.robothree.central.admincontrol.domain.AdminCapabilityState;
import com.robothree.central.admincontrol.domain.AdminModule;
import java.util.Objects;

public final class AdminReadRequestAuthorizer {

    private final AdminCapabilityProjectionService capabilityService;

    public AdminReadRequestAuthorizer(AdminCapabilityProjectionService capabilityService) {
        this.capabilityService = Objects.requireNonNull(capabilityService, "capabilityService");
    }

    public AdminCapabilityProjection authorize(AdminModule module) {
        AdminCapabilityProjection projection;
        try {
            projection = capabilityService.currentProjection();
        } catch (RuntimeException exception) {
            throw AdminReadException.sessionRequired();
        }
        AdminCapability capability = projection.capabilities().stream()
                .filter(candidate -> candidate.key().equals(module.readCapability()))
                .findFirst()
                .orElseThrow(AdminReadException::permissionDenied);
        if (capability.state() != AdminCapabilityState.READY
                && capability.state() != AdminCapabilityState.PARTIAL) {
            throw AdminReadException.permissionDenied();
        }
        return projection;
    }

    public AdminCapabilityProjection authorizeCapability(String capabilityKey) {
        AdminCapabilityProjection projection = currentCapabilities();
        AdminCapability capability = projection.capabilities().stream()
                .filter(candidate -> candidate.key().equals(capabilityKey))
                .findFirst()
                .orElseThrow(AdminReadException::permissionDenied);
        if (capability.state() != AdminCapabilityState.READY
                && capability.state() != AdminCapabilityState.PARTIAL) {
            throw AdminReadException.permissionDenied();
        }
        return projection;
    }

    public AdminCapabilityProjection currentCapabilities() {
        try {
            return capabilityService.currentProjection();
        } catch (RuntimeException exception) {
            throw AdminReadException.sessionRequired();
        }
    }
}
