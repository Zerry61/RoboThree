package com.robothree.central.persistence.mybatis.adapter;

import static com.robothree.central.persistence.mybatis.adapter.MyBatisPersistenceErrors.write;

import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.mybatis.mapper.ConfigurationPersistenceMapper;
import java.util.Objects;
import java.util.Optional;

public final class MyBatisConfigurationPersistence implements
        ConfigurationSnapshotRepository,
        PackageDocumentRepository {

    private final ConfigurationPersistenceMapper mapper;

    public MyBatisConfigurationPersistence(ConfigurationPersistenceMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    @Override
    public ImmutableConfigurationSnapshot insert(ImmutableConfigurationSnapshot snapshot) {
        int inserted = write(
                () -> mapper.insertSnapshot(
                        ConfigurationEntityConverter.toEntity(snapshot)),
                "persistence.configuration_active_conflict",
                "persistence.configuration_write_failed");
        if (inserted == 1) {
            return snapshot;
        }
        return requireSame(
                findSnapshot(snapshot.snapshotId(), snapshot.revision()),
                snapshot,
                "persistence.configuration_revision_conflict");
    }

    @Override
    public Optional<ImmutableConfigurationSnapshot> findSnapshot(
            String snapshotId,
            String revision) {
        return Optional.ofNullable(mapper.findSnapshot(snapshotId, revision))
                .map(ConfigurationEntityConverter::toDomain);
    }

    @Override
    public Optional<ImmutableConfigurationSnapshot> findActive() {
        return Optional.ofNullable(mapper.findActiveSnapshot())
                .map(ConfigurationEntityConverter::toDomain);
    }

    @Override
    public ImmutablePackageDocument insert(ImmutablePackageDocument document) {
        int inserted = write(
                () -> mapper.insertPackage(ConfigurationEntityConverter.toEntity(document)),
                "persistence.package_digest_conflict",
                "persistence.package_write_failed");
        if (inserted == 1) {
            return document;
        }
        return requireSame(
                findPackage(document.packageId(), document.revision()),
                document,
                "persistence.package_revision_conflict");
    }

    @Override
    public Optional<ImmutablePackageDocument> findPackage(
            String packageId,
            String revision) {
        return Optional.ofNullable(mapper.findPackage(packageId, revision))
                .map(ConfigurationEntityConverter::toDomain);
    }

    private static <T> T requireSame(
            Optional<T> existing,
            T requested,
            String conflictCode) {
        if (existing.isPresent() && existing.get().equals(requested)) {
            return existing.get();
        }
        throw new PersistenceConflictException(
                conflictCode,
                "immutable persistence key already has different data");
    }
}
