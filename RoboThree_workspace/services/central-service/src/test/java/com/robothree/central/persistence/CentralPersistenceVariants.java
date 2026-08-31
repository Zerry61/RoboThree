package com.robothree.central.persistence;

import com.robothree.central.persistence.mybatis.adapter.MyBatisAuthenticationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisConfigurationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisEnterpriseSessionPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.mapper.AuthenticationPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.ConfigurationPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.EnterpriseSessionPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.ModelInvocationPersistenceMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.mybatis.typehandler.PostgresTextArrayTypeHandler;
import com.robothree.central.persistence.mybatis.typehandler.PostgresUuidTypeHandler;
import javax.sql.DataSource;
import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

final class CentralPersistenceVariants {

    private CentralPersistenceVariants() {}

    static CentralPersistenceConformance.PersistenceHarness myBatis(DataSource dataSource) {
        return openMyBatis(dataSource).harness();
    }

    static MyBatisContext openMyBatis(DataSource dataSource) {
        try {
            Configuration configuration = new Configuration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(NoLoggingImpl.class);
            configuration.getTypeHandlerRegistry()
                    .register(PostgresTextArrayTypeHandler.class);
            configuration.getTypeHandlerRegistry()
                    .register(PostgresUuidTypeHandler.class);
            configuration.addMapper(MyBatisConnectionIdentityMapper.class);
            configuration.addMapper(AgentLifecyclePersistenceMapper.class);

            SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
            factoryBean.setDataSource(dataSource);
            factoryBean.setConfiguration(configuration);
            factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:mybatis/*Mapper.xml"));
            factoryBean.afterPropertiesSet();
            SqlSessionFactory factory = factoryBean.getObject();
            SqlSessionTemplate sessions = new SqlSessionTemplate(factory);
            DataSourceTransactionManager transactionManager =
                    new DataSourceTransactionManager(dataSource);
            MyBatisAuthenticationPersistence authentication =
                    new MyBatisAuthenticationPersistence(
                            sessions.getMapper(AuthenticationPersistenceMapper.class));
            MyBatisConfigurationPersistence configurationPersistence =
                    new MyBatisConfigurationPersistence(
                            sessions.getMapper(ConfigurationPersistenceMapper.class));
            MyBatisModelInvocationPersistence modelInvocationPersistence =
                    new MyBatisModelInvocationPersistence(
                            sessions.getMapper(ModelInvocationPersistenceMapper.class));
            SpringCentralTransactionRunner transactions =
                    new SpringCentralTransactionRunner(transactionManager);
            MyBatisEnterpriseSessionPersistence enterpriseSessions =
                    new MyBatisEnterpriseSessionPersistence(
                            sessions.getMapper(AuthenticationPersistenceMapper.class),
                            sessions.getMapper(EnterpriseSessionPersistenceMapper.class),
                            transactions);
            CentralPersistenceConformance.PersistenceHarness harness =
                    CentralPersistenceConformance.harness(
                            authentication,
                            authentication,
                            authentication,
                            authentication,
                            authentication,
                            authentication,
                            configurationPersistence,
                            configurationPersistence,
                            transactions);
            return new MyBatisContext(
                    harness,
                    modelInvocationPersistence,
                    enterpriseSessions,
                    sessions,
                    transactionManager);
        } catch (Exception exception) {
            throw new IllegalStateException("could not create MyBatis test context", exception);
        }
    }

    @FunctionalInterface
    interface Variant {
        CentralPersistenceConformance.PersistenceHarness open(DataSource dataSource);
    }

    record MyBatisContext(
            CentralPersistenceConformance.PersistenceHarness harness,
            MyBatisModelInvocationPersistence modelInvocations,
            MyBatisEnterpriseSessionPersistence enterpriseSessions,
            SqlSessionTemplate sessions,
            DataSourceTransactionManager transactionManager) {}
}
