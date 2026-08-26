package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import lombok.Getter;

@Getter
public final class PackageDocumentEntity {

    private String packageId;
    private String kind;
    private String revision;
    private String digest;
    private String documentJson;
    private OffsetDateTime insertedAt;

    public PackageDocumentEntity() {}

    public PackageDocumentEntity(
            String packageId,
            String kind,
            String revision,
            String digest,
            String documentJson,
            OffsetDateTime insertedAt) {
        this.packageId = packageId;
        this.kind = kind;
        this.revision = revision;
        this.digest = digest;
        this.documentJson = documentJson;
        this.insertedAt = insertedAt;
    }
}
