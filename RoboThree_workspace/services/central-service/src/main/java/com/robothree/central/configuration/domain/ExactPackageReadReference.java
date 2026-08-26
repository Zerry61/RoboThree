package com.robothree.central.configuration.domain;

import com.robothree.central.shared.domain.DomainValueChecks;
import java.util.Set;
import java.util.regex.Pattern;

public record ExactPackageReadReference(
        String snapshotId,
        String snapshotRevision,
        String snapshotDigest,
        String packageId,
        String kind,
        String packageRevision,
        String packageDigest) {

    private static final Pattern RESOURCE_ID =
            Pattern.compile("^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private static final Set<String> PACKAGE_KINDS = Set.of("agent", "skill");

    public ExactPackageReadReference {
        resourceId(snapshotId, "snapshotId");
        DomainValueChecks.digest(snapshotRevision, "snapshotRevision");
        DomainValueChecks.digest(snapshotDigest, "snapshotDigest");
        resourceId(packageId, "packageId");
        if (!PACKAGE_KINDS.contains(kind)) {
            throw new IllegalArgumentException("kind must be agent or skill");
        }
        DomainValueChecks.digest(packageRevision, "packageRevision");
        DomainValueChecks.digest(packageDigest, "packageDigest");
    }

    private static void resourceId(String value, String name) {
        DomainValueChecks.text(value, name);
        if (value.length() > 160 || !RESOURCE_ID.matcher(value).matches()) {
            throw new IllegalArgumentException(name + " is not a valid resource ID");
        }
    }
}
