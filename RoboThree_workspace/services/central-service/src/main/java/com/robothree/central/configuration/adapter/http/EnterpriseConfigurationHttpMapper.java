package com.robothree.central.configuration.adapter.http;

import com.robothree.central.configuration.domain.ExactPackageReadReference;

final class EnterpriseConfigurationHttpMapper {

    private EnterpriseConfigurationHttpMapper() {}

    static ExactPackageReadReference toExactPackageReference(
            String snapshotId,
            String snapshotRevision,
            String snapshotDigest,
            String packageId,
            String kind,
            String packageRevision,
            String packageDigest) {
        return new ExactPackageReadReference(
                snapshotId,
                snapshotRevision,
                snapshotDigest,
                packageId,
                kind,
                packageRevision,
                packageDigest);
    }
}
