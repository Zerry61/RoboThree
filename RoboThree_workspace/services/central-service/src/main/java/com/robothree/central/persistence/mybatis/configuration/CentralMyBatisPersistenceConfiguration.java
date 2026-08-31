package com.robothree.central.persistence.mybatis.configuration;

import com.robothree.central.persistence.mybatis.adapter.MyBatisAuthenticationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAdminModelStore;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAgentLifecycleStore;
import com.robothree.central.persistence.mybatis.adapter.MyBatisConfigurationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisEnterpriseSessionPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.mapper.AuthenticationPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.AdminModelPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.ConfigurationPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.EnterpriseSessionPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.ModelInvocationPersistenceMapper;
import com.robothree.central.persistence.mybatis.schema.CentralSchemaPreflight;
import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import com.robothree.central.persistence.mybatis.schema.SchemaManifestLoader;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.shared.observability.CentralObservationRunner;
import javax.sql.DataSource;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@ConditionalOnBean(DataSource.class)
@MapperScan(basePackageClasses = {
    AuthenticationPersistenceMapper.class,
    EnterpriseSessionPersistenceMapper.class,
    ModelInvocationPersistenceMapper.class,
    SchemaInspectionMapper.class
})
public class CentralMyBatisPersistenceConfiguration {

    @Bean
    MyBatisAuthenticationPersistence myBatisAuthenticationPersistence(
            AuthenticationPersistenceMapper mapper) {
        return new MyBatisAuthenticationPersistence(mapper);
    }

    @Bean
    MyBatisConfigurationPersistence myBatisConfigurationPersistence(
            ConfigurationPersistenceMapper mapper) {
        return new MyBatisConfigurationPersistence(mapper);
    }

    @Bean
    MyBatisAdminModelStore myBatisAdminModelStore(AdminModelPersistenceMapper mapper) {
        return new MyBatisAdminModelStore(mapper);
    }

    @Bean
    MyBatisAgentLifecycleStore myBatisAgentLifecycleStore(
            AgentLifecyclePersistenceMapper mapper) {
        return new MyBatisAgentLifecycleStore(mapper);
    }

    @Bean
    MyBatisModelInvocationPersistence myBatisModelInvocationPersistence(
            ModelInvocationPersistenceMapper mapper) {
        return new MyBatisModelInvocationPersistence(mapper);
    }

    @Bean
    MyBatisEnterpriseSessionPersistence myBatisEnterpriseSessionPersistence(
            AuthenticationPersistenceMapper authentication,
            EnterpriseSessionPersistenceMapper sessions,
            SpringCentralTransactionRunner transactions) {
        return new MyBatisEnterpriseSessionPersistence(
                authentication,
                sessions,
                transactions);
    }

    @Bean
    SpringCentralTransactionRunner springCentralTransactionRunner(
            PlatformTransactionManager transactionManager,
            ObjectProvider<CentralObservationRunner> observations) {
        return new SpringCentralTransactionRunner(
                transactionManager,
                observations.getIfAvailable(CentralObservationRunner::noop));
    }

    @Bean
    CentralSchemaPreflight centralSchemaPreflight(SchemaInspectionMapper mapper) {
        return new CentralSchemaPreflight(mapper, new SchemaManifestLoader().load());
    }

    @Bean
    SmartInitializingSingleton centralSchemaPreflightGate(
            CentralSchemaPreflight preflight) {
        return preflight::validate;
    }
}
