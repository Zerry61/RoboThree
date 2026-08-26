package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DataSourceUtils;

final class MyBatisTransactionConformance {

    private static final Instant NOW = Instant.parse("2026-07-28T12:00:00Z");

    private MyBatisTransactionConformance() {}

    static void verify(DataSource dataSource) {
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        var persistence = context.harness();
        MyBatisConnectionIdentityMapper identityMapper =
                context.sessions().getMapper(MyBatisConnectionIdentityMapper.class);
        EnterpriseUserPermission first = permission(1, true, NOW);
        persistence.permissions().save(first);

        Integer result = persistence.transactions().required(() -> {
            int jdbcBackend = jdbcBackendPid(dataSource);
            int myBatisBackend = identityMapper.currentBackendPid();
            assertThat(myBatisBackend).isEqualTo(jdbcBackend);
            assertThat(persistence.permissions().findEnabledForUpdate(
                            first.enterpriseId(),
                            first.userId()))
                    .containsExactly(first);
            persistence.permissions().save(permission(2, false, NOW.plusSeconds(1)));
            return myBatisBackend;
        });
        assertThat(result).isPositive();
        assertThat(persistence.permissions().find(
                        first.enterpriseId(),
                        first.userId(),
                        first.permission()))
                .contains(permission(2, false, NOW.plusSeconds(1)));

        assertThatThrownBy(() -> persistence.transactions().required(() -> {
                    assertThat(identityMapper.currentBackendPid())
                            .isEqualTo(jdbcBackendPid(dataSource));
                    persistence.permissions().save(
                            permission(3, true, NOW.plusSeconds(2)));
                    throw new NamedRollback();
                }))
                .isInstanceOf(NamedRollback.class);
        assertThat(persistence.permissions().find(
                        first.enterpriseId(),
                        first.userId(),
                        first.permission()))
                .contains(permission(2, false, NOW.plusSeconds(1)));
    }

    private static int jdbcBackendPid(DataSource dataSource) {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("SELECT pg_backend_pid()")) {
            result.next();
            return result.getInt(1);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "could not inspect transaction connection identity",
                    exception);
        }
    }

    private static EnterpriseUserPermission permission(
            long revision,
            boolean enabled,
            Instant updatedAt) {
        return new EnterpriseUserPermission(
                "enterprise.transaction",
                "user.transaction",
                "configuration.read",
                enabled,
                revision,
                updatedAt);
    }

    private static final class NamedRollback extends RuntimeException {}
}
