package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.DeviceTrustDecision;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import java.time.Instant;

public interface EnterpriseDeviceTrustProvider {

    DeviceTrustDecision requireTrusted(EnterpriseDevice device, Instant evaluatedAt);
}
