package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import java.time.Instant;

public interface EnterpriseBearerAuthorizer {

    EnterpriseBearerAuthorizationResult authorize(
            String compactToken,
            String requiredPermission,
            Instant now);
}
