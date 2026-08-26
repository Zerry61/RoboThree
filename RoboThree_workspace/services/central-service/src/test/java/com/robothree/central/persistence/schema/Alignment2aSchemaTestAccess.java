package com.robothree.central.persistence.schema;

import javax.sql.DataSource;

public final class Alignment2aSchemaTestAccess {

    private Alignment2aSchemaTestAccess() {}

    public static void installFreshAndValidate(DataSource dataSource) {
        new SchemaTestInstaller().installFresh(dataSource);
        Alignment2aSchemaConformance.validate(dataSource);
    }

    public static void validate(DataSource dataSource) {
        Alignment2aSchemaConformance.validate(dataSource);
    }
}
