package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.persistence.mybatis.entity.ConfigurationSnapshotEntity;
import com.robothree.central.persistence.mybatis.entity.PackageDocumentEntity;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

final class ConfigurationEntityConverter {

    private ConfigurationEntityConverter() {}

    static ConfigurationSnapshotEntity toEntity(ImmutableConfigurationSnapshot value) {
        return new ConfigurationSnapshotEntity(
                value.snapshotId(),
                value.revision(),
                value.digest(),
                value.schemaVersion(),
                value.documentJson(),
                value.etag(),
                value.active(),
                at(value.generatedAt()),
                at(value.insertedAt()));
    }

    static ImmutableConfigurationSnapshot toDomain(ConfigurationSnapshotEntity value) {
        return new ImmutableConfigurationSnapshot(
                value.getSnapshotId(),
                value.getRevision(),
                value.getDigest(),
                value.getSchemaVersion(),
                value.getDocumentJson(),
                value.getEtag(),
                value.isActive(),
                value.getGeneratedAt().toInstant(),
                value.getInsertedAt().toInstant());
    }

    static PackageDocumentEntity toEntity(ImmutablePackageDocument value) {
        return new PackageDocumentEntity(
                value.packageId(),
                value.kind(),
                value.revision(),
                value.digest(),
                value.documentJson(),
                at(value.insertedAt()));
    }

    static ImmutablePackageDocument toDomain(PackageDocumentEntity value) {
        return new ImmutablePackageDocument(
                value.getPackageId(),
                value.getKind(),
                value.getRevision(),
                value.getDigest(),
                value.getDocumentJson(),
                value.getInsertedAt().toInstant());
    }

    private static OffsetDateTime at(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }
}
