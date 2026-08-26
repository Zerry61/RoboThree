package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import java.util.List;
import java.util.Optional;

public interface EnterprisePermissionRepository {

    EnterpriseUserPermission save(EnterpriseUserPermission permission);

    Optional<EnterpriseUserPermission> find(
            String enterpriseId,
            String userId,
            String permission);

    List<EnterpriseUserPermission> findEnabled(String enterpriseId, String userId);

    List<EnterpriseUserPermission> findEnabledForUpdate(String enterpriseId, String userId);

    List<EnterpriseUserPermission> findRequestedForUpdate(
            String enterpriseId,
            String userId,
            List<String> orderedPermissions);
}
