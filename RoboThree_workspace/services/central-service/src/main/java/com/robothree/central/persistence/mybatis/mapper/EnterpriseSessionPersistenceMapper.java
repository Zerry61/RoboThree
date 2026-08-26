package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.EnterpriseSessionChallengeBindingEntity;
import com.robothree.central.persistence.mybatis.entity.EnterpriseSessionLeaseIssuanceEntity;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface EnterpriseSessionPersistenceMapper {

    int insertChallengeBinding(EnterpriseSessionChallengeBindingEntity binding);

    EnterpriseSessionChallengeBindingEntity findChallengeBindingById(
            @Param("challengeId") UUID challengeId);

    EnterpriseSessionChallengeBindingEntity findChallengeBindingByIdForUpdate(
            @Param("challengeId") UUID challengeId);

    EnterpriseSessionChallengeBindingEntity findChallengeBindingByCorrelationId(
            @Param("correlationId") UUID correlationId);

    int insertLeaseIssuance(EnterpriseSessionLeaseIssuanceEntity issuance);

    EnterpriseSessionLeaseIssuanceEntity findLeaseByTokenId(
            @Param("tokenId") UUID tokenId);

    EnterpriseSessionLeaseIssuanceEntity findLeaseByChallengeIdForUpdate(
            @Param("challengeId") UUID challengeId);
}
