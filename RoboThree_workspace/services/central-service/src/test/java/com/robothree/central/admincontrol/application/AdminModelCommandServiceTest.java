package com.robothree.central.admincontrol.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import com.robothree.central.admincontrol.adapter.http.InternalTrialAdminModelDiscoveryController;
import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import com.robothree.central.modelgateway.application.ModelDispatchDecision;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

final class AdminModelCommandServiceTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-30T08:00:00Z"), ZoneOffset.UTC);

    @Test
    void createsReplaysUpdatesTestsEnablesAndSelectsDefaultWithExactRevisionAuthority()
            throws Exception {
        MemoryStore store = new MemoryStore();
        AdminModelCredentialCipher cipher = new AdminModelCredentialCipher(
                Base64.getEncoder().encodeToString(new byte[32]), new SecureRandom(), CLOCK);
        AdminModelCommandService service = new AdminModelCommandService(
                store, cipher,
                (model, correlationId) -> new AdminModelConnectionTester.Result(
                        "success", null, 12, CLOCK.instant(), correlationId),
                new com.robothree.central.persistence.port.CentralTransactionRunner() {
                    @Override public <T> T required(Supplier<T> work) { return work.get(); }
                }, CLOCK);

        UUID createId = UUID.randomUUID();
        ObjectNode create = command("""
                {"kind":"create_admin_model","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","displayName":"Enterprise Model",
                 "providerFamily":"openai_compatible","endpoint":"https://provider.example/v1",
                 "providerModelId":"gpt-compatible","credential":{"mode":"replace","secret":"secret-value"}}
                """.formatted(createId, UUID.randomUUID()));
        ObjectNode created = service.execute(create, "Test Admin");
        String modelId = created.path("modelId").asText();
        String createdRevision = created.path("modelRevision").asText();
        assertThat(service.get(modelId).credentialConfigured()).isTrue();
        assertThat(service.execute(create, "Test Admin").path("replayed").asBoolean()).isTrue();
        assertThat(store.revisions).hasSize(1);

        ObjectNode update = command("""
                {"kind":"update_admin_model","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","modelId":"%s",
                 "expectedModelRevision":"%s","changes":{"displayName":"Enterprise Model 2",
                 "credential":{"mode":"retain"}}}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), modelId, createdRevision));
        String updatedRevision = service.execute(update, "Test Admin").path("modelRevision").asText();
        assertThat(service.get(modelId).displayName()).isEqualTo("Enterprise Model 2");
        assertThatThrownBy(() -> service.execute(command(update.toString()
                        .replace(updatedRevision, createdRevision)
                        .replace(update.path("commandId").asText(), UUID.randomUUID().toString())),
                "Test Admin")).isInstanceOf(AdminModelMutationException.class);

        ObjectNode test = command("""
                {"kind":"test_admin_model_connection","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","modelId":"%s",
                 "expectedModelRevision":"%s"}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), modelId, updatedRevision));
        ObjectNode tested = service.execute(test, "Test Admin");
        assertThat(tested.path("kind").asText()).isEqualTo("admin_model_connection_test_receipt");
        assertThat(tested.path("connectionCheck").path("status").asText()).isEqualTo("success");

        String testedRevision = tested.path("modelRevision").asText();
        ObjectNode enable = command("""
                {"kind":"set_admin_model_lifecycle","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","modelId":"%s",
                 "expectedModelRevision":"%s","lifecycle":"enabled",
                 "defaultDisposition":{"mode":"unchanged"}}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), modelId, testedRevision));
        String enabledRevision = service.execute(enable, "Test Admin").path("modelRevision").asText();
        ObjectNode setDefault = command("""
                {"kind":"set_default_admin_model","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","modelId":"%s",
                 "expectedModelRevision":"%s","expectedCurrentDefault":{"state":"none"}}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), modelId, enabledRevision));
        service.execute(setDefault, "Test Admin");
        assertThat(service.currentDefault().orElseThrow().modelRevision()).isEqualTo(enabledRevision);
        ObjectNode rename = command("""
                {"kind":"update_admin_model","contractVersion":"admin-control.v1alpha2",
                 "commandId":"%s","correlationId":"%s","modelId":"%s",
                 "expectedModelRevision":"%s","changes":{"displayName":"Enterprise Model 3",
                 "credential":{"mode":"retain"}}}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), modelId, enabledRevision));
        String renamedRevision = service.execute(rename, "Test Admin")
                .path("modelRevision").asText();
        assertThat(service.currentDefault().orElseThrow().modelRevision())
                .isEqualTo(renamedRevision);
        assertThat(service.get(modelId).connectionStatus()).isEqualTo("success");
        ObjectNode discovery = new InternalTrialAdminModelDiscoveryController(
                store,
                (token, permission, now) -> new EnterpriseBearerAuthorizationResult.Success(
                        new EnterpriseBearerPrincipal(
                                "v1alpha1", "enterprise.internal-trial", "user.internal-trial",
                                "device.internal-trial", UUID.randomUUID(), UUID.randomUUID(),
                                List.of("model.use"), now.minusSeconds(60), now.plusSeconds(3600))),
                CLOCK)
                .defaultModel("internal-trial-token")
                .getBody();
        assertThat(discovery).isNotNull();
        assertThat(discovery.fieldNames()).toIterable().containsExactlyInAnyOrder(
                "schemaVersion", "configurationRevision", "modelId", "modelCreatedAt",
                "displayName", "supportsToolCalling");
        assertThat(discovery.toString()).doesNotContain("provider.example")
                .doesNotContain("gpt-compatible")
                .doesNotContain("secret-value");
        var audit = new ModelInvocationAuditInventorySource(
                new com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository() {
                    @Override public com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox insert(
                            com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox item) {
                        throw new UnsupportedOperationException();
                    }
                    @Override public List<com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox>
                            findPending(int limit) { return List.of(); }
                }, store).capture(CLOCK.instant());
        assertThat(audit.items()).isNotEmpty();
        assertThat(audit.items().stream()
                .map(item -> item.summary().path("actionSummary").asText()))
                .anyMatch(summary -> summary.contains(modelId) && summary.contains("displayName"));
        assertThat(audit.items().toString()).doesNotContain("provider.example")
                .doesNotContain("secret-value");
        assertThat(store.audits).hasSize(6);
        assertThat(store.receipts).hasSize(6);
    }

    @Test
    void gatewayAcceptsOnlyCurrentEnabledRevisionButRecoversPersistedExactBinding() {
        MemoryStore store = new MemoryStore();
        AdminModelCredentialCipher cipher = new AdminModelCredentialCipher(
                Base64.getEncoder().encodeToString(new byte[32]), new SecureRandom(), CLOCK);
        String modelId = "model.enterprise:test";
        String enabledRevision = "sha256:" + "1".repeat(64);
        AdminModelStore.EncryptedCredential encrypted = cipher.encrypt(
                modelId, "gateway-secret".toCharArray());
        AdminManagedModel enabled = new AdminManagedModel(
                modelId, enabledRevision, "Test", "openai_compatible",
                "https://provider.example/v1", "gpt-compatible", "enabled",
                encrypted.credentialReference(), encrypted.credentialRevision(),
                "success", null, 12L, CLOCK.instant(), UUID.randomUUID(), CLOCK.instant());
        assertThat(store.insertRevision(enabled, "{}", "1".repeat(64))).isEqualTo(1);
        assertThat(store.createHead(modelId, enabledRevision, CLOCK.instant())).isEqualTo(1);
        assertThat(store.insertCredential(encrypted)).isEqualTo(1);

        AdminManagedModelGatewaySource gateway = new AdminManagedModelGatewaySource(store, CLOCK);
        ModelEndpointBinding.Selection selection = new ModelEndpointBinding.Selection(
                modelId, "9".repeat(64), "1".repeat(64), "3".repeat(64));
        ModelEndpointBinding binding = gateway.resolveForSelection(selection);
        String decision = ModelDispatchDecision.fromBinding(binding).decisionDigest();
        assertThat(gateway.resolveDispatchDecision(decision)).isEqualTo(binding);
        assertThat(gateway.resolve(binding.reference()).enabled()).isTrue();

        AdminManagedModelCredentialMaterialSource material =
                new AdminManagedModelCredentialMaterialSource(store, cipher);
        char[] secret = material.resolve(
                binding.credentialReference(), binding.credentialRevision());
        assertThat(new String(secret)).isEqualTo("gateway-secret");
        java.util.Arrays.fill(secret, '\0');

        String disabledRevision = "sha256:" + "4".repeat(64);
        AdminManagedModel disabled = new AdminManagedModel(
                modelId, disabledRevision, enabled.displayName(), enabled.providerFamily(),
                enabled.endpoint(), enabled.providerModelId(), "disabled",
                enabled.credentialReference(), enabled.credentialRevision(),
                enabled.connectionStatus(), null, enabled.connectionDurationMs(),
                enabled.connectionTestedAt(), enabled.connectionCorrelationId(), CLOCK.instant());
        assertThat(store.insertRevision(disabled, "{}", "4".repeat(64))).isEqualTo(1);
        assertThat(store.advanceHead(modelId, enabledRevision, disabledRevision, CLOCK.instant()))
                .isEqualTo(1);
        assertThatThrownBy(() -> gateway.resolveForSelection(selection))
                .hasMessageContaining("binding");
        assertThat(gateway.resolveDispatchDecision(decision)).isEqualTo(binding);
        assertThat(gateway.resolve(binding.reference()).enabled()).isTrue();
    }

    private static ObjectNode command(String json) throws Exception {
        return (ObjectNode) JSON.readTree(json);
    }

    private static final class MemoryStore implements AdminModelStore {
        private final Map<String, AdminManagedModel> heads = new LinkedHashMap<>();
        private final Map<String, AdminManagedModel> revisions = new LinkedHashMap<>();
        private final Map<String, EncryptedCredential> credentials = new LinkedHashMap<>();
        private final Map<UUID, CommandReceipt> receipts = new LinkedHashMap<>();
        private final List<AuditEvent> audits = new ArrayList<>();
        private final Map<String, GatewayBinding> gatewayBindings = new LinkedHashMap<>();
        private DefaultSelection selected;
        @Override public Optional<AdminManagedModel> findCurrent(String id) { return Optional.ofNullable(heads.get(id)); }
        @Override public Optional<AdminManagedModel> findRevision(String id, String revision) {
            return Optional.ofNullable(revisions.get(id + revision));
        }
        @Override public List<AdminManagedModel> listCurrent() { return List.copyOf(heads.values()); }
        @Override public int insertRevision(AdminManagedModel model, String json, String digest) {
            return revisions.putIfAbsent(model.modelId() + model.modelRevision(), model) == null ? 1 : 0;
        }
        @Override public int createHead(String id, String revision, Instant at) {
            AdminManagedModel model = revisions.get(id + revision);
            return model != null && heads.putIfAbsent(id, model) == null ? 1 : 0;
        }
        @Override public int advanceHead(String id, String expected, String revision, Instant at) {
            AdminManagedModel current = heads.get(id); AdminManagedModel next = revisions.get(id + revision);
            if (current == null || next == null || !current.modelRevision().equals(expected)) return 0;
            heads.put(id, next); return 1;
        }
        @Override public Optional<DefaultSelection> findDefault() { return Optional.ofNullable(selected); }
        @Override public int replaceDefault(String expectedId, String expectedRevision,
                String id, String revision, Instant at) {
            if (expectedId == null ? selected != null : selected == null
                    || !selected.modelId().equals(expectedId)
                    || !selected.modelRevision().equals(expectedRevision)) return 0;
            selected = new DefaultSelection(id, revision); return 1;
        }
        @Override public int clearDefault(String id, String revision) {
            if (selected == null || !selected.modelId().equals(id)
                    || !selected.modelRevision().equals(revision)) return 0;
            selected = null; return 1;
        }
        @Override public int insertCredential(EncryptedCredential value) {
            return credentials.putIfAbsent(value.credentialReference() + value.credentialRevision(), value) == null ? 1 : 0;
        }
        @Override public Optional<EncryptedCredential> findCredential(String ref, String rev) {
            return Optional.ofNullable(credentials.get(ref + rev));
        }
        @Override public Optional<CommandReceipt> findReceipt(UUID id) { return Optional.ofNullable(receipts.get(id)); }
        @Override public int insertReceipt(CommandReceipt value) { return receipts.putIfAbsent(value.commandId(), value) == null ? 1 : 0; }
        @Override public int insertAudit(AuditEvent value) { audits.add(value); return 1; }
        @Override public List<AuditEvent> listAudit(int limit) {
            return audits.stream().limit(limit).toList();
        }
        @Override public int insertGatewayBinding(GatewayBinding value) {
            return gatewayBindings.putIfAbsent(value.decisionDigest(), value) == null ? 1 : 0;
        }
        @Override public Optional<GatewayBinding> findGatewayBinding(String decisionDigest) {
            return Optional.ofNullable(gatewayBindings.get(decisionDigest));
        }
        @Override public Optional<GatewayBinding> findGatewayBindingByReference(
                String bindingRevision, String bindingDigest) {
            return gatewayBindings.values().stream().filter(value ->
                    value.bindingRevision().equals(bindingRevision)
                            && value.bindingDigest().equals(bindingDigest)).findFirst();
        }
    }
}
