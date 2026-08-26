package com.robothree.central.persistence.mybatis.schema;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SchemaInspectionMapper {

    @Select("""
            SELECT count(*)
            FROM enterprise_verified_identity
            WHERE false
            """)
    int probeAuthenticationRead();

    @Select("""
            SELECT count(*)
            FROM enterprise_configuration_snapshot
            WHERE false
            """)
    int probeConfigurationRead();

    @Select("""
            SELECT count(*)
            FROM model_invocation
            WHERE false
            """)
    int probeModelInvocationRead();

    @Select("""
            SELECT count(*)
            FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = #{tableName}
            """)
    int countTable(@Param("tableName") String tableName);

    @Select("""
            SELECT column_name AS columnName,
                   udt_name AS udtName,
                   is_nullable AS nullable,
                   column_default AS columnDefault
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = #{tableName}
            ORDER BY ordinal_position
            """)
    List<ColumnRow> selectColumns(@Param("tableName") String tableName);

    @Select("""
            SELECT count(*)
            FROM information_schema.table_constraints
            WHERE constraint_schema = current_schema()
              AND constraint_name = #{constraintName}
            """)
    int countConstraint(@Param("constraintName") String constraintName);

    @Select("""
            SELECT count(*)
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = #{indexName}
            """)
    int countIndex(@Param("indexName") String indexName);

    @Select("""
            SELECT version,
                   script_name AS scriptName,
                   script_digest AS scriptDigest,
                   release_version AS releaseVersion
            FROM robothree_schema_version
            ORDER BY version
            """)
    List<SchemaVersionRow> selectSchemaVersions();

    record ColumnRow(
            String columnName, String udtName, String nullable, String columnDefault) {}

    record SchemaVersionRow(
            int version, String scriptName, String scriptDigest, String releaseVersion) {}
}
