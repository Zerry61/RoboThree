package com.robothree.central.admincontrol.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleAvailability;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

public class AdminReadProjectionServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-08-27T02:00:00Z");
    private static final UUID REQUEST_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID CORRELATION_ID = UUID.fromString("20000000-0000-4000-8000-000000000002");

    @Test
    void pagesStableItemsAndRoundTripsOnlyOpaqueCursorState() {
        AdminReadProjectionService service = service(new HmacAdminCursorCodec(new byte[32]));

        AdminReadResult first = service.list(
                AdminModule.SKILLS, REQUEST_ID, CORRELATION_ID, null, 1, null);
        assertThat(first.httpStatus()).isEqualTo(200);
        assertThat(first.body().path("data").path("items")).hasSize(1);
        assertThat(first.body().path("data").path("items").get(0).path("displayName").asText())
                .isEqualTo("Alpha Skill");
        String cursor = first.body().path("data").path("nextCursor").asText();
        assertThat(cursor).startsWith("r3admin1.");
        assertThat(cursor).doesNotContain("Alpha Skill", "skill.alpha");

        AdminReadResult second = service.list(
                AdminModule.SKILLS, REQUEST_ID, CORRELATION_ID, cursor, 1, null);
        assertThat(second.body().path("data").path("items").get(0).path("displayName").asText())
                .isEqualTo("Beta Skill");

        AdminReadResult unchanged = service.list(
                AdminModule.SKILLS, REQUEST_ID, CORRELATION_ID, null, 1, first.etag());
        assertThat(unchanged.httpStatus()).isEqualTo(304);
        assertThat(unchanged.body()).isNull();
    }

    @Test
    void aCursorFromAnotherRuntimeFailsClosedAsStale() {
        AdminReadProjectionService original = service(
                new HmacAdminCursorCodec(new byte[32]));
        byte[] replacementKey = new byte[32];
        replacementKey[0] = 1;
        AdminReadProjectionService restarted = service(
                new HmacAdminCursorCodec(replacementKey));
        String cursor = original.list(AdminModule.SKILLS, REQUEST_ID, CORRELATION_ID,
                        null, 1, null)
                .body().path("data").path("nextCursor").asText();

        assertThatThrownBy(() -> restarted.list(
                AdminModule.SKILLS, REQUEST_ID, CORRELATION_ID, cursor, 1, null))
                .isInstanceOf(AdminReadException.class)
                .extracting("errorCode")
                .isEqualTo("stale_cursor");
    }

    @Test
    void gatedAndUnavailableModulesNeverBecomeEmptySuccesses() {
        AdminReadProjectionService service = service(new HmacAdminCursorCodec(new byte[32]));

        assertThatThrownBy(() -> service.list(
                AdminModule.TOOLS, REQUEST_ID, CORRELATION_ID, null, 10, null))
                .isInstanceOf(AdminReadException.class)
                .extracting("errorCode")
                .isEqualTo("business_rule_unavailable");
        assertThatThrownBy(() -> service.detail(
                AdminModule.ROBOTS, "agent.missing", REQUEST_ID, CORRELATION_ID, null))
                .isInstanceOf(AdminReadException.class)
                .extracting("errorCode")
                .isEqualTo("service_unavailable");
    }

    @Test
    void envelopeKeepsTestIdentityHonestAndDoesNotLeakPrivateMaterial() {
        AdminReadResult result = service(new HmacAdminCursorCodec(new byte[32]))
                .detail(AdminModule.SKILLS, "skill.alpha", REQUEST_ID, CORRELATION_ID, null);

        assertThat(result.body().path("testIdentityUsed").asBoolean()).isTrue();
        assertThat(result.body().path("productionIdentityReady").asBoolean()).isFalse();
        assertThat(result.body().toString()).doesNotContain(
                "credential", "endpoint", "utf8Content", "instructions", "stack");
    }

    private static AdminReadProjectionService service(HmacAdminCursorCodec cursorCodec) {
        var capabilityService = new AdminCapabilityProjectionService(
                new DevelopmentAdminPrincipalProvider());
        return new AdminReadProjectionService(
                new AdminReadRequestAuthorizer(capabilityService),
                catalog(),
                cursorCodec,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    public static AdminInventoryCatalog catalog() {
        List<AdminModuleInventorySource> sources = new ArrayList<>();
        for (AdminModule module : AdminModule.values()) {
            sources.add(fixed(module));
        }
        return new AdminInventoryCatalog(sources);
    }

    private static AdminModuleInventorySource fixed(AdminModule module) {
        return new AdminModuleInventorySource() {
            @Override
            public AdminModule module() {
                return module;
            }

            @Override
            public AdminModuleInventoryLease capture(Instant now) {
                if (module == AdminModule.TOOLS) {
                    return lease(module, AdminModuleAvailability.GATED, List.of(), now);
                }
                if (module == AdminModule.ROBOTS) {
                    return lease(module, AdminModuleAvailability.UNAVAILABLE, List.of(), now);
                }
                if (module == AdminModule.SKILLS) {
                    return lease(module, AdminModuleAvailability.PARTIAL, List.of(
                            skill("skill.beta", "Beta Skill", "b"),
                            skill("skill.alpha", "Alpha Skill", "a")), now);
                }
                return lease(module, AdminModuleAvailability.PARTIAL, List.of(), now);
            }
        };
    }

    private static AdminModuleInventoryLease lease(
            AdminModule module,
            AdminModuleAvailability availability,
            List<AdminInventoryItem> items,
            Instant now) {
        return new AdminModuleInventoryLease(
                module,
                "test_only_exact_inventory.v1",
                "sha256:" + "f".repeat(64),
                availability,
                availability == AdminModuleAvailability.READY ? null : "test_safe_reason",
                now,
                items);
    }

    private static AdminInventoryItem skill(String id, String name, String hex) {
        String revision = "sha256:" + hex.repeat(64);
        ObjectNode summary = JSON.createObjectNode();
        summary.put("skillId", id);
        summary.put("skillRevision", revision);
        summary.put("displayName", name);
        summary.put("description", "Safe fixture description");
        summary.put("lifecycle", "unavailable");
        summary.put("packageValidationState", "valid");
        ObjectNode detail = summary.deepCopy();
        detail.put("packageDigest", revision);
        detail.put("validationSummary", "Validated test-only package");
        return new AdminInventoryItem(id, name, revision, summary, detail);
    }
}
