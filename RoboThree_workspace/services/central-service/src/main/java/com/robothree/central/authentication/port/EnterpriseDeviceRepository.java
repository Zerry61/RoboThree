package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.EnterpriseDevice;
import java.util.Optional;

public interface EnterpriseDeviceRepository {

    EnterpriseDevice insert(EnterpriseDevice device);

    Optional<EnterpriseDevice> findById(String deviceId);

    Optional<EnterpriseDevice> findByIdForUpdate(String deviceId);

    Optional<EnterpriseDevice> findByKeyId(String enterpriseId, String deviceKeyId);

    Optional<EnterpriseDevice> findByPublicKeyDigest(
            String enterpriseId,
            String publicKeyDigest);
}
