package com.robothree.central.configuration.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.domain.DomainValueChecks;
import java.time.Instant;
import java.util.Objects;

public record ImmutableConfigurationSnapshot(
        String snapshotId,
        String revision,
        String digest,
        String schemaVersion,
        String documentJson,
        String etag,
        boolean active,
        Instant generatedAt,
        Instant insertedAt) {

    public ImmutableConfigurationSnapshot {
        text(snapshotId, "snapshotId");
        DomainValueChecks.digest(revision, "revision");
        DomainValueChecks.digest(digest, "digest");
        text(schemaVersion, "schemaVersion");
        text(documentJson, "documentJson");
        text(etag, "etag");
        Objects.requireNonNull(generatedAt, "generatedAt");
        Objects.requireNonNull(insertedAt, "insertedAt");
    }
}
