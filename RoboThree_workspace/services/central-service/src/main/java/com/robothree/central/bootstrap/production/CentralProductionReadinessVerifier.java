package com.robothree.central.bootstrap.production;

import com.robothree.central.persistence.mybatis.schema.CentralSchemaPreflight;
import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Objects;
import javax.sql.DataSource;
import org.springframework.beans.factory.ListableBeanFactory;

public final class CentralProductionReadinessVerifier {

    private final ListableBeanFactory beanFactory;
    private final DataSource fixedDataSource;
    private final Runnable fixedSchemaValidation;
    private final SchemaInspectionMapper fixedMapper;

    public CentralProductionReadinessVerifier(ListableBeanFactory beanFactory) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        fixedDataSource = null;
        fixedSchemaValidation = null;
        fixedMapper = null;
    }

    CentralProductionReadinessVerifier(
            DataSource dataSource,
            Runnable schemaValidation,
            SchemaInspectionMapper mapper) {
        beanFactory = null;
        fixedDataSource = Objects.requireNonNull(dataSource, "dataSource");
        fixedSchemaValidation =
                Objects.requireNonNull(schemaValidation, "schemaValidation");
        fixedMapper = Objects.requireNonNull(mapper, "mapper");
    }

    public void validate() {
        try {
            DataSource dataSource = fixedDataSource != null
                    ? fixedDataSource
                    : beanFactory.getBean(DataSource.class);
            Runnable schemaValidation = fixedSchemaValidation != null
                    ? fixedSchemaValidation
                    : beanFactory.getBean(CentralSchemaPreflight.class)::validate;
            SchemaInspectionMapper mapper = fixedMapper != null
                    ? fixedMapper
                    : beanFactory.getBean(SchemaInspectionMapper.class);
            validateConnection(dataSource);
            schemaValidation.run();
            if (mapper.probeAuthenticationRead() != 0
                    || mapper.probeConfigurationRead() != 0
                    || mapper.probeModelInvocationRead() != 0) {
                throw new CentralProductionStartupException(
                        "central.production_read_probe_invalid",
                        "production persistence read probe returned an invalid result");
            }
        } catch (CentralProductionStartupException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new CentralProductionStartupException(
                    "central.production_readiness_failed",
                    "production readiness validation failed");
        }
    }

    private static void validateConnection(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("SELECT 1")) {
            if (!result.next() || result.getInt(1) != 1 || result.next()) {
                throw new CentralProductionStartupException(
                        "central.production_connection_probe_invalid",
                        "production database connection probe returned an invalid result");
            }
        } catch (CentralProductionStartupException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new CentralProductionStartupException(
                    "central.production_database_unavailable",
                    "production database is unavailable");
        }
    }
}
