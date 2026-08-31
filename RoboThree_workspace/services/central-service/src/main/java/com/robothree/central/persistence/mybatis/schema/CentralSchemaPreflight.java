package com.robothree.central.persistence.mybatis.schema;

import com.robothree.central.persistence.PersistenceIntegrityException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

public final class CentralSchemaPreflight {

    private static final Map<Integer, LegacyScript> LEGACY_SCRIPTS = Map.of(
            1,
            new LegacyScript(
                    "V1__verified_identity_and_permissions.sql",
                    "3a23b472e3cc67d834ef628d14bc45a63311831fa11f97cf4ae781e7835dee46"),
            2,
            new LegacyScript(
                    "V2__device_registration_enrollment_and_challenge.sql",
                    "021bfeb40cfed2c98f56b84273a4cecf0bc6c20e80a79a82a9d5cd5fa211db21"),
            3,
            new LegacyScript(
                    "V3__token_issuance.sql",
                    "a0e16eda59c95049b5f899026ca8bd698610635762db56737622773b494a126f"),
            4,
            new LegacyScript(
                    "V4__immutable_configuration.sql",
                    "6dc43be8a4610abc57c45bb5d354c8dab09bbfd59a8fd93297d918fed53c6f28"),
            5,
            new LegacyScript(
                    "V5__challenge_consumption_idempotency.sql",
                    "f250a660c2c604f4d53749da238f50978131bf62188ad062d8eb09c4d54cd5e6"));
    private static final LegacyScript V0006_FRESH = new LegacyScript(
            "B0006__central_foundation.sql",
            "2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480");
    private static final LegacyScript V0006_BRIDGE = new LegacyScript(
            "U0006__bridge_from_flyway_v5.sql",
            "ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909");
    private static final LegacyScript V0007_FRESH = new LegacyScript(
            "B0007__model_invocation_foundation.sql",
            "c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140");
    private static final LegacyScript V0007_UPGRADE = new LegacyScript(
            "U0007__model_invocation_from_v0006.sql",
            "6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a");
    private static final LegacyScript V0008_FRESH = new LegacyScript(
            "B0008__provider_usage_facts.sql",
            "46880b8f5392ae3978f19206af9205b51f82df1bb2e85339d9a8d73c77a1221c");
    private static final LegacyScript V0008_UPGRADE = new LegacyScript(
            "U0008__provider_usage_facts_from_v0007.sql",
            "246419d6960487cb507276ad8173905163320200331f27803ac004e65f74f2fc");
    private static final LegacyScript V0009_FRESH = new LegacyScript(
            "B0009__prompt_cache_planning.sql",
            "8f21541e794a33c5c0123b61fde3f354a685cc59b157184a4cce426839608dac");
    private static final LegacyScript V0009_UPGRADE = new LegacyScript(
            "U0009__prompt_cache_planning_from_v0008.sql",
            "9c158e5621b618dec85655e778383e0869245c7815bf999cc1c161400daa29f6");
    private static final LegacyScript V0010_FRESH = new LegacyScript(
            "B0010__enterprise_session_persistence.sql",
            "5fb746ec65281894a47747ea10f0615feb88a3c818ace959951a8e1103205ae6");
    private static final LegacyScript V0010_UPGRADE = new LegacyScript(
            "U0010__enterprise_session_persistence_from_v0009.sql",
            "1f276a223d9853be28a6d4f0ca0a3afff7cc42fc35dc46669e8b4289bda6af49");
    private static final LegacyScript V0011_FRESH = new LegacyScript(
            "B0011__admin_model_management.sql",
            "5d9335c2bf07ff605ddb3e42146cedba2c48d6806c01fa0e6b854f0383bd3e4f");
    private static final LegacyScript V0011_UPGRADE = new LegacyScript(
            "U0011__admin_model_management_from_v0010.sql",
            "7ebb73e1d06171805457576882b9fc79218ae0dd6e6658d9fbf38beb37cd3bf5");

    private final SchemaInspectionMapper mapper;
    private final SchemaManifest manifest;

    public CentralSchemaPreflight(SchemaInspectionMapper mapper, SchemaManifest manifest) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.manifest = Objects.requireNonNull(manifest, "manifest");
    }

    public void validate() {
        if (mapper.countTable("robothree_schema_version") != 1) {
            throw integrity(
                    "persistence.schema_ledger_missing",
                    "schema ledger is unavailable");
        }
        validateLedger();
        validateStructure();
    }

    private void validateLedger() {
        List<SchemaInspectionMapper.SchemaVersionRow> rows = mapper.selectSchemaVersions();
        if (rows.isEmpty()) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "schema ledger has no supported target");
        }
        if (rows.stream().anyMatch(row -> row.version() > manifest.targetSchemaVersion())) {
            throw integrity(
                    "persistence.schema_too_new",
                    "schema ledger contains a newer version");
        }

        List<SchemaInspectionMapper.SchemaVersionRow> targets = rows.stream()
                .filter(row -> row.version() == manifest.targetSchemaVersion())
                .toList();
        if (targets.size() != 1) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "schema target version is incomplete");
        }

        SchemaInspectionMapper.SchemaVersionRow target = targets.getFirst();
        SchemaManifest.Script targetScript;
        try {
            targetScript = manifest.scriptForName(target.scriptName());
        } catch (IllegalArgumentException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    "schema target script is not in the manifest",
                    exception);
        }
        if (!target.scriptDigest().equals(targetScript.scriptDigest())) {
            throw integrity(
                    "persistence.schema_script_digest_mismatch",
                    "schema target digest does not match the manifest");
        }
        if (!target.releaseVersion().equals(manifest.releaseVersion())) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "schema target release does not match the manifest");
        }

        if (targetScript.entryPath().equals("fresh")) {
            if (rows.size() != 1) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh schema ledger contains unsupported history");
            }
            return;
        }

        Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion = rows.stream()
                .collect(Collectors.toUnmodifiableMap(
                        SchemaInspectionMapper.SchemaVersionRow::version, row -> row));
        if (manifest.targetSchemaVersion() == 12) {
            validateV0012UpgradeHistory(rows, byVersion);
            return;
        }
        if (manifest.targetSchemaVersion() == 11) {
            validateV0011UpgradeHistory(rows, byVersion);
            return;
        }
        if (manifest.targetSchemaVersion() == 10) {
            validateV0010UpgradeHistory(rows, byVersion);
            return;
        }
        if (manifest.targetSchemaVersion() == 9) {
            validateV0009UpgradeHistory(rows, byVersion);
            return;
        }
        if (manifest.targetSchemaVersion() == 8) {
            validateV0008UpgradeHistory(rows, byVersion);
            return;
        }
        validateV0007UpgradeHistory(rows, byVersion);
    }

    private static void validateV0012UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        SchemaInspectionMapper.SchemaVersionRow v0011 = byVersion.get(11);
        if (v0011 == null
                || !(matches(v0011, V0011_FRESH) || matches(v0011, V0011_UPGRADE))
                || !v0011.releaseVersion().equals("0.0.0-mvp.admin.vs1")) {
            throw integrity("persistence.schema_unsupported_history",
                    "v0011 history row does not match frozen facts");
        }
        List<SchemaInspectionMapper.SchemaVersionRow> priorRows = rows.stream()
                .filter(row -> row.version() != 12).toList();
        Map<Integer, SchemaInspectionMapper.SchemaVersionRow> prior = byVersion.entrySet().stream()
                .filter(entry -> entry.getKey() != 12)
                .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        validateV0011UpgradeHistory(priorRows, prior);
    }

    private static void validateV0011UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        SchemaInspectionMapper.SchemaVersionRow v0010 = byVersion.get(10);
        if (v0010 == null
                || !(matches(v0010, V0010_FRESH) || matches(v0010, V0010_UPGRADE))
                || !v0010.releaseVersion().equals("0.0.0-eipc.1.1.2")) {
            throw integrity("persistence.schema_unsupported_history",
                    "v0010 history row does not match frozen facts");
        }
        List<SchemaInspectionMapper.SchemaVersionRow> priorRows = rows.stream()
                .filter(row -> row.version() != 11).toList();
        Map<Integer, SchemaInspectionMapper.SchemaVersionRow> prior = byVersion.entrySet().stream()
                .filter(entry -> entry.getKey() != 11)
                .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        validateV0010UpgradeHistory(priorRows, prior);
    }

    private static void validateV0010UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        java.util.Set<Integer> versions = byVersion.keySet();
        if (versions.equals(java.util.Set.of(9, 10))) {
            requireHistoryRow(byVersion, 9, V0009_FRESH, "0.0.0-arh.3.2.2");
            return;
        }
        if (versions.equals(java.util.Set.of(8, 9, 10))) {
            requireHistoryRow(byVersion, 8, V0008_FRESH, "0.0.0-arh.3.1");
            requireHistoryRow(byVersion, 9, V0009_UPGRADE, "0.0.0-arh.3.2.2");
            return;
        }
        if (versions.equals(java.util.Set.of(7, 8, 9, 10))) {
            requireHistoryRow(byVersion, 7, V0007_FRESH, "0.0.0-cgf.2a.1");
            requireHistoryRow(byVersion, 8, V0008_UPGRADE, "0.0.0-arh.3.1");
            requireHistoryRow(byVersion, 9, V0009_UPGRADE, "0.0.0-arh.3.2.2");
            return;
        }
        if (versions.equals(java.util.Set.of(6, 7, 8, 9, 10))) {
            requireHistoryRow(byVersion, 6, V0006_FRESH, "0.0.0-cja.2a.1");
            requireHistoryRow(byVersion, 7, V0007_UPGRADE, "0.0.0-cgf.2a.1");
            requireHistoryRow(byVersion, 8, V0008_UPGRADE, "0.0.0-arh.3.1");
            requireHistoryRow(byVersion, 9, V0009_UPGRADE, "0.0.0-arh.3.2.2");
            return;
        }
        if (versions.equals(java.util.Set.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))) {
            for (Map.Entry<Integer, LegacyScript> expected : LEGACY_SCRIPTS.entrySet()) {
                requireHistoryRow(
                        byVersion,
                        expected.getKey(),
                        expected.getValue(),
                        "pre-manifest-legacy");
            }
            requireHistoryRow(byVersion, 6, V0006_BRIDGE, "0.0.0-cja.2a.1");
            requireHistoryRow(byVersion, 7, V0007_UPGRADE, "0.0.0-cgf.2a.1");
            requireHistoryRow(byVersion, 8, V0008_UPGRADE, "0.0.0-arh.3.1");
            requireHistoryRow(byVersion, 9, V0009_UPGRADE, "0.0.0-arh.3.2.2");
            return;
        }
        throw integrity(
                "persistence.schema_unsupported_history",
                "v0010 upgrade history is not an exact supported chain");
    }

    private static void requireHistoryRow(
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion,
            int version,
            LegacyScript expected,
            String releaseVersion) {
        SchemaInspectionMapper.SchemaVersionRow row = byVersion.get(version);
        if (row == null
                || !matches(row, expected)
                || !row.releaseVersion().equals(releaseVersion)) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "schema history row does not match frozen facts");
        }
    }

    private static void validateV0009UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        SchemaInspectionMapper.SchemaVersionRow v0008 = byVersion.get(8);
        if (v0008 == null) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "v0008 upgrade history is missing");
        }
        if (matches(v0008, V0008_FRESH)) {
            if (rows.size() != 2 || !byVersion.keySet().equals(java.util.Set.of(8, 9))) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh v0008 upgrade history is not exact");
            }
            return;
        }
        if (!matches(v0008, V0008_UPGRADE)) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "v0008 upgrade history is unsupported");
        }
        SchemaInspectionMapper.SchemaVersionRow v0007 = byVersion.get(7);
        if (v0007 == null || (!matches(v0007, V0007_FRESH)
                && !matches(v0007, V0007_UPGRADE))) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "v0007 history below v0008 is unsupported");
        }
        if (matches(v0007, V0007_FRESH)) {
            if (rows.size() != 3
                    || !byVersion.keySet().equals(java.util.Set.of(7, 8, 9))) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh v0007 history below v0009 is not exact");
            }
            return;
        }
        validateV0006HistoryForV0009(rows, byVersion);
    }

    private static void validateV0006HistoryForV0009(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        SchemaInspectionMapper.SchemaVersionRow v0006 = byVersion.get(6);
        if (v0006 == null) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "v0006 history below v0009 is missing");
        }
        if (matches(v0006, V0006_FRESH)) {
            if (rows.size() != 4
                    || !byVersion.keySet().equals(java.util.Set.of(6, 7, 8, 9))) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh v0006 history below v0009 is not exact");
            }
            return;
        }
        if (!matches(v0006, V0006_BRIDGE)
                || rows.size() != 9
                || !byVersion.keySet().equals(
                        java.util.Set.of(1, 2, 3, 4, 5, 6, 7, 8, 9))) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "bridge history below v0009 is unsupported");
        }
        for (Map.Entry<Integer, LegacyScript> expectedScript : LEGACY_SCRIPTS.entrySet()) {
            SchemaInspectionMapper.SchemaVersionRow row = byVersion.get(expectedScript.getKey());
            if (row == null || !matches(row, expectedScript.getValue())
                    || !row.releaseVersion().equals("pre-manifest-legacy")) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "bridge history below v0009 does not match legacy facts");
            }
        }
    }

    private static void validateV0008UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        SchemaInspectionMapper.SchemaVersionRow v0007 = byVersion.get(7);
        if (v0007 == null) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "v0007 upgrade history is missing");
        }
        if (matches(v0007, V0007_FRESH)) {
            if (rows.size() != 2
                    || !byVersion.keySet().equals(java.util.Set.of(7, 8))) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh v0007 upgrade history is not exact");
            }
            return;
        }
        if (!matches(v0007, V0007_UPGRADE)) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "v0007 upgrade history is unsupported");
        }
        validateV0006History(rows, byVersion, true);
    }

    private static void validateV0007UpgradeHistory(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion) {
        validateV0006History(rows, byVersion, false);
    }

    private static void validateV0006History(
            List<SchemaInspectionMapper.SchemaVersionRow> rows,
            Map<Integer, SchemaInspectionMapper.SchemaVersionRow> byVersion,
            boolean includesV0008) {
        SchemaInspectionMapper.SchemaVersionRow v0006 = byVersion.get(6);
        if (v0006 == null) {
            throw integrity(
                    "persistence.schema_version_incomplete",
                    "v0006 upgrade history is missing");
        }
        if (matches(v0006, V0006_FRESH)) {
            java.util.Set<Integer> expectedVersions = includesV0008
                    ? java.util.Set.of(6, 7, 8)
                    : java.util.Set.of(6, 7);
            if (rows.size() != expectedVersions.size()
                    || !byVersion.keySet().equals(expectedVersions)) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "fresh v0006 upgrade history is not exact");
            }
            return;
        }
        java.util.Set<Integer> expectedVersions = includesV0008
                ? java.util.Set.of(1, 2, 3, 4, 5, 6, 7, 8)
                : java.util.Set.of(1, 2, 3, 4, 5, 6, 7);
        if (!matches(v0006, V0006_BRIDGE)
                || rows.size() != expectedVersions.size()
                || !byVersion.keySet().equals(expectedVersions)) {
            throw integrity(
                    "persistence.schema_unsupported_history",
                    "v0006 upgrade history is unsupported");
        }
        for (Map.Entry<Integer, LegacyScript> expectedScript : LEGACY_SCRIPTS.entrySet()) {
            SchemaInspectionMapper.SchemaVersionRow row = byVersion.get(expectedScript.getKey());
            if (row == null
                    || !matches(row, expectedScript.getValue())
                    || !row.releaseVersion().equals("pre-manifest-legacy")) {
                throw integrity(
                        "persistence.schema_unsupported_history",
                        "bridge schema history does not match frozen legacy facts");
            }
        }
    }

    private static boolean matches(
            SchemaInspectionMapper.SchemaVersionRow row,
            LegacyScript expected) {
        return row.scriptName().equals(expected.scriptName())
                && row.scriptDigest().equals(expected.scriptDigest());
    }

    private void validateStructure() {
        for (Map.Entry<String, List<CentralSchemaSpecification.RequiredColumn>> table :
                CentralSchemaSpecification.TABLES.entrySet()) {
            if (mapper.countTable(table.getKey()) != 1) {
                throw integrity(
                        "persistence.schema_missing_table",
                        "required schema table is missing");
            }
            Map<String, SchemaInspectionMapper.ColumnRow> actual = mapper
                    .selectColumns(table.getKey())
                    .stream()
                    .collect(Collectors.toUnmodifiableMap(
                            SchemaInspectionMapper.ColumnRow::columnName, row -> row));
            for (CentralSchemaSpecification.RequiredColumn expected : table.getValue()) {
                SchemaInspectionMapper.ColumnRow column = actual.get(expected.name());
                if (column == null) {
                    throw integrity(
                            "persistence.schema_missing_column",
                            "required schema column is missing");
                }
                boolean nullable = column.nullable().equals("YES");
                if (!column.udtName().equals(expected.udtName())
                        || nullable != expected.nullable()) {
                    throw integrity(
                            "persistence.schema_column_mismatch",
                            "required schema column does not match");
                }
            }
        }
        for (String constraint : CentralSchemaSpecification.CONSTRAINTS) {
            if (mapper.countConstraint(constraint) != 1) {
                throw integrity(
                        "persistence.schema_missing_constraint",
                        "required schema constraint is missing");
            }
        }
        for (String index : CentralSchemaSpecification.INDEXES) {
            if (mapper.countIndex(index) != 1) {
                throw integrity(
                        "persistence.schema_missing_index",
                        "required schema index is missing");
            }
        }
    }

    private static PersistenceIntegrityException integrity(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }

    private record LegacyScript(String scriptName, String scriptDigest) {}
}
