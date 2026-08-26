package com.robothree.central.bootstrap.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

class CentralProductionReadinessVerifierTest {

    @Test
    void anEmptyButStructurallyValidBusinessDatabaseCanBeReady() throws Exception {
        Fixture fixture = fixture();

        fixture.verifier().validate();

        assertThat(fixture.mapper().probeAuthenticationRead()).isZero();
        assertThat(fixture.mapper().probeConfigurationRead()).isZero();
        assertThat(fixture.mapper().probeModelInvocationRead()).isZero();
    }

    @Test
    void connectionFailureUsesTypedSafeFailure() throws Exception {
        Fixture fixture = fixture();
        fixture.connectionState().failure =
                new SQLException("private database endpoint");

        assertThatThrownBy(fixture.verifier()::validate)
                .isInstanceOfSatisfying(
                        CentralProductionStartupException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo("central.production_database_unavailable"))
                .hasMessageNotContaining("private database endpoint");
    }

    @Test
    void healthSeparatesReadinessFromProcessLiveness() throws Exception {
        Fixture fixture = fixture();
        ProductionDependencyValidator dependencies = new ProductionDependencyValidator(
                new org.springframework.beans.factory.support.DefaultListableBeanFactory(),
                new ProductionDependencyManifest(java.util.List.of()));
        CentralProductionReadinessHealthIndicator indicator =
                new CentralProductionReadinessHealthIndicator(
                        dependencies, fixture.verifier());

        assertThat(indicator.health().getStatus().getCode()).isEqualTo("UP");

        fixture.connectionState().failure = new SQLException("offline");
        assertThat(indicator.health().getStatus().getCode()).isEqualTo("DOWN");
        assertThat(indicator.health().getDetails())
                .containsEntry(
                        "errorCode",
                        "central.production_database_unavailable")
                .doesNotContainKey("exception");
    }

    private static Fixture fixture() throws Exception {
        ConnectionState state = new ConnectionState();
        DataSource dataSource = dataSource(state);
        SchemaInspectionMapper mapper = new EmptyReadProbeMapper();
        return new Fixture(
                dataSource,
                mapper,
                state,
                new CentralProductionReadinessVerifier(dataSource, () -> {}, mapper));
    }

    private record Fixture(
            DataSource dataSource,
            SchemaInspectionMapper mapper,
            ConnectionState connectionState,
            CentralProductionReadinessVerifier verifier) {}

    private static DataSource dataSource(ConnectionState state) {
        return (DataSource) Proxy.newProxyInstance(
                DataSource.class.getClassLoader(),
                new Class<?>[] {DataSource.class},
                (proxy, method, arguments) -> {
                    if (method.getName().equals("getConnection")) {
                        if (state.failure != null) {
                            throw state.failure;
                        }
                        return connection();
                    }
                    return defaultValue(method.getReturnType());
                });
    }

    private static Connection connection() {
        return (Connection) Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[] {Connection.class},
                (proxy, method, arguments) -> {
                    if (method.getName().equals("createStatement")) {
                        return statement();
                    }
                    return defaultValue(method.getReturnType());
                });
    }

    private static Statement statement() {
        return (Statement) Proxy.newProxyInstance(
                Statement.class.getClassLoader(),
                new Class<?>[] {Statement.class},
                (proxy, method, arguments) -> {
                    if (method.getName().equals("executeQuery")
                            && arguments.length == 1
                            && arguments[0].equals("SELECT 1")) {
                        return resultSet();
                    }
                    return defaultValue(method.getReturnType());
                });
    }

    private static ResultSet resultSet() {
        int[] cursor = {0};
        return (ResultSet) Proxy.newProxyInstance(
                ResultSet.class.getClassLoader(),
                new Class<?>[] {ResultSet.class},
                (proxy, method, arguments) -> {
                    if (method.getName().equals("next")) {
                        return cursor[0]++ == 0;
                    }
                    if (method.getName().equals("getInt")) {
                        return 1;
                    }
                    return defaultValue(method.getReturnType());
                });
    }

    private static Object defaultValue(Class<?> type) {
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        return null;
    }

    private static final class ConnectionState {
        private SQLException failure;
    }

    private static final class EmptyReadProbeMapper implements SchemaInspectionMapper {

        @Override
        public int probeAuthenticationRead() {
            return 0;
        }

        @Override
        public int probeConfigurationRead() {
            return 0;
        }

        @Override
        public int probeModelInvocationRead() {
            return 0;
        }

        @Override
        public int countTable(String tableName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public java.util.List<ColumnRow> selectColumns(String tableName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int countConstraint(String constraintName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int countIndex(String indexName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public java.util.List<SchemaVersionRow> selectSchemaVersions() {
            throw new UnsupportedOperationException();
        }
    }
}
