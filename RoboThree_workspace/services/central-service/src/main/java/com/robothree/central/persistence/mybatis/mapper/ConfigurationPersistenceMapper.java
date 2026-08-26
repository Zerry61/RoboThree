package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.ConfigurationSnapshotEntity;
import com.robothree.central.persistence.mybatis.entity.PackageDocumentEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ConfigurationPersistenceMapper {

    int insertSnapshot(ConfigurationSnapshotEntity snapshot);

    ConfigurationSnapshotEntity findSnapshot(
            @Param("snapshotId") String snapshotId,
            @Param("revision") String revision);

    ConfigurationSnapshotEntity findActiveSnapshot();

    int insertPackage(PackageDocumentEntity document);

    PackageDocumentEntity findPackage(
            @Param("packageId") String packageId,
            @Param("revision") String revision);
}
