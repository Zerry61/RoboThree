package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import lombok.Getter;

@Getter
public final class ConfigurationSnapshotEntity {

    private String snapshotId;
    private String revision;
    private String digest;
    private String schemaVersion;
    private String documentJson;
    private String etag;
    private boolean active;
    private OffsetDateTime generatedAt;
    private OffsetDateTime insertedAt;

    public ConfigurationSnapshotEntity() {}

    public ConfigurationSnapshotEntity(
            String snapshotId,
            String revision,
            String digest,
            String schemaVersion,
            String documentJson,
            String etag,
            boolean active,
            OffsetDateTime generatedAt,
            OffsetDateTime insertedAt) {
        this.snapshotId = snapshotId;
        this.revision = revision;
        this.digest = digest;
        this.schemaVersion = schemaVersion;
        this.documentJson = documentJson;
        this.etag = etag;
        this.active = active;
        this.generatedAt = generatedAt;
        this.insertedAt = insertedAt;
    }
}
