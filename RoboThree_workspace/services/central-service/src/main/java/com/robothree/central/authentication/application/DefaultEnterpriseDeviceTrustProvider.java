package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.DeviceTrustDecision;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import java.time.Instant;

public final class DefaultEnterpriseDeviceTrustProvider
        implements EnterpriseDeviceTrustProvider {

    @Override
    public DeviceTrustDecision requireTrusted(EnterpriseDevice device, Instant evaluatedAt) {
        if (device.disabledAt() != null || device.revokedAt() != null) {
            throw EnterpriseAuthenticationException.authorization(
                    "device_access_denied",
                    "This device is disabled or revoked.");
        }
        if (!"managed".equals(device.managedStatus())) {
            throw EnterpriseAuthenticationException.authorization(
                    "device_not_managed",
                    "This device is not managed by the enterprise.");
        }
        if (!"compliant".equals(device.complianceStatus())) {
            throw EnterpriseAuthenticationException.authorization(
                    "device_not_compliant",
                    "This device does not meet enterprise compliance requirements.");
        }
        return new DeviceTrustDecision(device, true);
    }
}
