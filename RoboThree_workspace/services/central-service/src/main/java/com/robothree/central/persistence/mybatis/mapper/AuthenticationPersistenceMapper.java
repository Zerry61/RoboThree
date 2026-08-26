package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.AccessTokenIssuanceEntity;
import com.robothree.central.persistence.mybatis.entity.DeviceChallengeEntity;
import com.robothree.central.persistence.mybatis.entity.DeviceEnrollmentGrantEntity;
import com.robothree.central.persistence.mybatis.entity.EnterpriseDeviceEntity;
import com.robothree.central.persistence.mybatis.entity.EnterprisePermissionEntity;
import com.robothree.central.persistence.mybatis.entity.VerifiedIdentityEntity;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuthenticationPersistenceMapper {

    int insertVerifiedIdentity(VerifiedIdentityEntity identity);

    VerifiedIdentityEntity findVerifiedIdentityById(@Param("id") UUID id);

    VerifiedIdentityEntity findVerifiedIdentityByIdForUpdate(@Param("id") UUID id);

    int disableVerifiedIdentity(
            @Param("id") UUID id,
            @Param("disabledAt") OffsetDateTime disabledAt);

    int savePermission(EnterprisePermissionEntity permission);

    EnterprisePermissionEntity findPermission(
            @Param("enterpriseId") String enterpriseId,
            @Param("userId") String userId,
            @Param("permission") String permission);

    List<EnterprisePermissionEntity> findEnabledPermissions(
            @Param("enterpriseId") String enterpriseId,
            @Param("userId") String userId);

    List<EnterprisePermissionEntity> findEnabledPermissionsForUpdate(
            @Param("enterpriseId") String enterpriseId,
            @Param("userId") String userId);

    List<EnterprisePermissionEntity> findRequestedPermissionsForUpdate(
            @Param("enterpriseId") String enterpriseId,
            @Param("userId") String userId,
            @Param("permissions") List<String> permissions);

    int insertDevice(EnterpriseDeviceEntity device);

    EnterpriseDeviceEntity findDeviceById(@Param("deviceId") String deviceId);

    EnterpriseDeviceEntity findDeviceByIdForUpdate(@Param("deviceId") String deviceId);

    EnterpriseDeviceEntity findDeviceByKeyId(
            @Param("enterpriseId") String enterpriseId,
            @Param("deviceKeyId") String deviceKeyId);

    EnterpriseDeviceEntity findDeviceByPublicKeyDigest(
            @Param("enterpriseId") String enterpriseId,
            @Param("publicKeyDigest") String publicKeyDigest);

    int insertEnrollmentGrant(DeviceEnrollmentGrantEntity grant);

    DeviceEnrollmentGrantEntity findEnrollmentGrantById(@Param("id") UUID id);

    DeviceEnrollmentGrantEntity findEnrollmentGrantByCodeDigest(
            @Param("codeDigest") String codeDigest);

    DeviceEnrollmentGrantEntity findEnrollmentGrantByCodeDigestForUpdate(
            @Param("codeDigest") String codeDigest);

    int consumeEnrollmentGrant(
            @Param("id") UUID id,
            @Param("consumedAt") OffsetDateTime consumedAt);

    int insertChallenge(DeviceChallengeEntity challenge);

    DeviceChallengeEntity findChallengeById(@Param("id") UUID id);

    DeviceChallengeEntity findChallengeByIdForUpdate(@Param("id") UUID id);

    int consumeChallenge(
            @Param("id") UUID id,
            @Param("consumedAt") OffsetDateTime consumedAt,
            @Param("consumedBy") String consumedBy,
            @Param("requestDigest") String requestDigest);

    int insertTokenIssuance(AccessTokenIssuanceEntity issuance);

    AccessTokenIssuanceEntity findTokenIssuanceById(@Param("id") UUID id);
}
