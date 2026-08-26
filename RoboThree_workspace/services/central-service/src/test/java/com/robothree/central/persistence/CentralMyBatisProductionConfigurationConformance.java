package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAuthenticationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisConfigurationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisEnterpriseSessionPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.configuration.CentralMyBatisPersistenceConfiguration;
import com.robothree.central.persistence.mybatis.schema.CentralSchemaPreflight;
import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

final class CentralMyBatisProductionConfigurationConformance {

    private CentralMyBatisProductionConfigurationConformance() {}

    static void verify(DataSource dataSource) {
        context(dataSource).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(MyBatisAuthenticationPersistence.class);
            assertThat(context).hasSingleBean(MyBatisConfigurationPersistence.class);
            assertThat(context).hasSingleBean(MyBatisModelInvocationPersistence.class);
            assertThat(context).hasSingleBean(MyBatisEnterpriseSessionPersistence.class);
            assertThat(context).hasSingleBean(SpringCentralTransactionRunner.class);
            assertThat(context).hasSingleBean(CentralSchemaPreflight.class);
            assertThat(context).hasSingleBean(SchemaInspectionMapper.class);
            assertThat(context.getBean(SchemaInspectionMapper.class)
                            .probeAuthenticationRead())
                    .isZero();
            assertThat(context.getBean(SchemaInspectionMapper.class)
                            .probeConfigurationRead())
                    .isZero();
            assertThat(context.getBean(SchemaInspectionMapper.class)
                            .probeModelInvocationRead())
                    .isZero();

            MyBatisAuthenticationPersistence authentication =
                    context.getBean(MyBatisAuthenticationPersistence.class);
            MyBatisConfigurationPersistence configuration =
                    context.getBean(MyBatisConfigurationPersistence.class);
            MyBatisModelInvocationPersistence modelInvocations =
                    context.getBean(MyBatisModelInvocationPersistence.class);
            CentralPersistenceConformance.verify(CentralPersistenceConformance.harness(
                    authentication,
                    authentication,
                    authentication,
                    authentication,
                    authentication,
                    authentication,
                    configuration,
                    configuration,
                    context.getBean(SpringCentralTransactionRunner.class)));
            ModelInvocationPersistenceConformance.verify(
                    ModelInvocationPersistenceConformance.harness(
                            modelInvocations,
                            modelInvocations,
                            modelInvocations,
                            modelInvocations,
                            context.getBean(SpringCentralTransactionRunner.class)));
        });
    }

    static void verifyPreflightFailsClosed(DataSource dataSource) {
        context(dataSource).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .isInstanceOf(PersistenceIntegrityException.class)
                    .hasMessageContaining("required schema column is missing");
        });
    }

    private static ApplicationContextRunner context(DataSource dataSource) {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(MybatisPlusAutoConfiguration.class))
                .withUserConfiguration(CentralMyBatisPersistenceConfiguration.class)
                .withBean(DataSource.class, () -> dataSource)
                .withBean(
                        PlatformTransactionManager.class,
                        () -> new DataSourceTransactionManager(dataSource))
                .withPropertyValues(
                        "mybatis-plus.configuration.log-impl="
                                + "org.apache.ibatis.logging.nologging.NoLoggingImpl",
                        "mybatis-plus.configuration.map-underscore-to-camel-case=true",
                        "mybatis-plus.type-handlers-package="
                                + "com.robothree.central.persistence.mybatis.typehandler",
                        "mybatis-plus.mapper-locations=classpath*:mybatis/*Mapper.xml");
    }
}
