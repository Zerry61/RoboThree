package com.robothree.central.configuration.port;

import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import java.util.Optional;

public interface ConfigurationSnapshotRepository {

    ImmutableConfigurationSnapshot insert(ImmutableConfigurationSnapshot snapshot);

    Optional<ImmutableConfigurationSnapshot> findSnapshot(String snapshotId, String revision);

    Optional<ImmutableConfigurationSnapshot> findActive();
}
