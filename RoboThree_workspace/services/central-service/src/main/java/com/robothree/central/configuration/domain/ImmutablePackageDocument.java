package com.robothree.central.configuration.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.domain.DomainValueChecks;
import java.time.Instant;
import java.util.Objects;

public record ImmutablePackageDocument(
        String packageId,
        String kind,
        String revision,
        String digest,
        String documentJson,
        Instant insertedAt) {

    public ImmutablePackageDocument {
        text(packageId, "packageId");
        text(kind, "kind");
        DomainValueChecks.digest(revision, "revision");
        DomainValueChecks.digest(digest, "digest");
        text(documentJson, "documentJson");
        Objects.requireNonNull(insertedAt, "insertedAt");
    }
}
