package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public final class AdminModelCommandService {

    public static final String CONTRACT_VERSION = "admin-control.v1alpha2";
    private static final ObjectMapper JSON = new ObjectMapper();
    private final AdminModelStore store;
    private final AdminModelCredentialCipher credentialCipher;
    private final CentralTransactionRunner transactions;
    private final AdminModelConnectionTester connectionTester;
    private final Clock clock;

    public AdminModelCommandService(
            AdminModelStore store,
            AdminModelCredentialCipher credentialCipher,
            AdminModelConnectionTester connectionTester,
            CentralTransactionRunner transactions,
            Clock clock) {
        this.store = store;
        this.credentialCipher = credentialCipher;
        this.connectionTester = connectionTester;
        this.transactions = transactions;
        this.clock = clock;
    }

    public ObjectNode execute(ObjectNode command, String actorSummary) {
        String kind = text(command, "kind", 80);
        if (!CONTRACT_VERSION.equals(text(command, "contractVersion", 80))) {
            throw AdminModelMutationException.invalidRequest();
        }
        UUID commandId = uuid(command, "commandId");
        UUID correlationId = uuid(command, "correlationId");
        String commandDigest = "sha256:" + CanonicalJson.sha256(CanonicalJson.canonicalize(command));
        Optional<AdminModelStore.CommandReceipt> prior = store.findReceipt(commandId);
        if (prior.isPresent()) {
            if (!prior.get().commandDigest().equals(commandDigest)) {
                throw AdminModelMutationException.revisionConflict();
            }
            ObjectNode replay = CanonicalJson.parseObject(prior.get().resultJson(), 32_768);
            replay.put("replayed", true);
            return replay;
        }
        return switch (kind) {
            case "create_admin_model" -> create(command, actorSummary, commandId,
                    correlationId, commandDigest);
            case "update_admin_model" -> update(command, actorSummary, commandId,
                    correlationId, commandDigest);
            case "test_admin_model_connection" -> testConnection(command, actorSummary,
                    commandId, correlationId, commandDigest);
            case "set_admin_model_lifecycle" -> lifecycle(command, actorSummary, commandId,
                    correlationId, commandDigest);
            case "set_default_admin_model" -> setDefault(command, actorSummary, commandId,
                    correlationId, commandDigest);
            default -> throw AdminModelMutationException.invalidRequest();
        };
    }

    private ObjectNode testConnection(ObjectNode command, String actor, UUID commandId,
            UUID correlationId, String commandDigest) {
        requireExact(command, Set.of("kind", "contractVersion", "commandId", "correlationId",
                "modelId", "expectedModelRevision"), Set.of());
        String modelId = id(command, "modelId");
        String expected = revisionText(command, "expectedModelRevision");
        AdminManagedModel current = expected(modelId, expected);
        if (!current.credentialConfigured()) {
            throw AdminModelMutationException.businessRule("配置访问凭据后才能测试连接。");
        }
        AdminModelConnectionTester.Result tested = connectionTester.test(current, correlationId);
        AdminManagedModel next = revision(modelId, current.displayName(), current.providerFamily(),
                current.endpoint(), current.providerModelId(), current.lifecycle(),
                current.credentialReference(), current.credentialRevision(), tested.status(),
                tested.safeReason(), tested.durationMs(), tested.testedAt(), tested.correlationId(),
                clock.instant());
        return transactions.required(() -> {
            insertRevision(next);
            advance(modelId, expected, next);
            ObjectNode receipt = baseReceipt(commandId, correlationId, next);
            receipt.put("kind", "admin_model_connection_test_receipt");
            ObjectNode check = receipt.putObject("connectionCheck");
            check.put("status", tested.status());
            if (tested.safeReason() != null) check.put("safeReason", tested.safeReason());
            check.put("durationMs", tested.durationMs());
            check.put("testedAt", tested.testedAt().toString());
            check.put("correlationId", tested.correlationId().toString());
            persistReceiptAndAudit(commandId, correlationId, commandDigest, actor,
                    "test_model_connection", next, List.of("lastConnectionCheck"), receipt);
            return receipt;
        });
    }

    public List<AdminManagedModel> list() { return store.listCurrent(); }
    public AdminManagedModel get(String modelId) {
        return store.findCurrent(modelId).orElseThrow(AdminModelMutationException::notFound);
    }
    public Optional<AdminModelStore.DefaultSelection> currentDefault() { return store.findDefault(); }

    private ObjectNode create(ObjectNode command, String actor, UUID commandId,
            UUID correlationId, String commandDigest) {
        requireExact(command, Set.of("kind", "contractVersion", "commandId", "correlationId",
                "displayName", "providerFamily", "endpoint", "providerModelId", "credential"), Set.of());
        String displayName = text(command, "displayName", 128);
        String providerFamily = exact(command, "providerFamily", "openai_compatible");
        String endpoint = endpoint(command, "endpoint");
        String providerModelId = text(command, "providerModelId", 256);
        ObjectNode credential = object(command, "credential");
        requireExact(credential, Set.of("mode", "secret"), Set.of());
        exact(credential, "mode", "replace");
        char[] secret = secret(credential, "secret");
        String modelId = "model.enterprise:" + UUID.randomUUID().toString().toLowerCase();
        AdminModelStore.EncryptedCredential encrypted = credentialCipher.encrypt(modelId, secret);
        Instant now = clock.instant();
        AdminManagedModel model = revision(modelId, displayName, providerFamily, endpoint,
                providerModelId, "disabled", encrypted.credentialReference(),
                encrypted.credentialRevision(), "unverified", null, null, null, null, now);
        return transactions.required(() -> {
            insertRevision(model);
            if (store.insertCredential(encrypted) != 1 || store.createHead(
                    model.modelId(), model.modelRevision(), now) != 1) {
                throw AdminModelMutationException.revisionConflict();
            }
            return commit(commandId, correlationId, commandDigest, actor,
                    "create_model", model, List.of("displayName", "providerFamily", "endpoint",
                            "providerModelId", "credential"));
        });
    }

    private ObjectNode update(ObjectNode command, String actor, UUID commandId,
            UUID correlationId, String commandDigest) {
        requireExact(command, Set.of("kind", "contractVersion", "commandId", "correlationId",
                "modelId", "expectedModelRevision", "changes"), Set.of());
        String modelId = id(command, "modelId");
        String expected = revisionText(command, "expectedModelRevision");
        ObjectNode changes = object(command, "changes");
        Set<String> optionalChanges = Set.of(
                "displayName", "endpoint", "providerModelId", "credential");
        requireExact(changes, optionalChanges, optionalChanges);
        if (changes.isEmpty()) throw AdminModelMutationException.invalidRequest();
        AdminManagedModel current = expected(modelId, expected);
        List<String> changed = new ArrayList<>();
        String displayName = optionalText(changes, "displayName", 128, current.displayName(), changed);
        String endpoint = optionalEndpoint(changes, "endpoint", current.endpoint(), changed);
        String providerModelId = optionalText(changes, "providerModelId", 256,
                current.providerModelId(), changed);
        AdminModelStore.EncryptedCredential encrypted = null;
        String credentialReference = current.credentialReference();
        String credentialRevision = current.credentialRevision();
        if (changes.has("credential")) {
            ObjectNode directive = object(changes, "credential");
            String mode = text(directive, "mode", 20);
            if (mode.equals("retain")) {
                requireExact(directive, Set.of("mode"), Set.of());
            } else if (mode.equals("replace")) {
                requireExact(directive, Set.of("mode", "secret"), Set.of());
                encrypted = credentialCipher.encrypt(modelId, secret(directive, "secret"));
                credentialReference = encrypted.credentialReference();
                credentialRevision = encrypted.credentialRevision();
                changed.add("credential");
            } else throw AdminModelMutationException.invalidRequest();
        }
        if (changed.isEmpty()) {
            throw AdminModelMutationException.businessRule("没有需要保存的变更。");
        }
        boolean connectionChanged = changed.stream().anyMatch(
                field -> Set.of("endpoint", "providerModelId", "credential").contains(field));
        AdminManagedModel next = revision(modelId, displayName, current.providerFamily(), endpoint,
                providerModelId, current.lifecycle(), credentialReference, credentialRevision,
                connectionChanged ? "unverified" : current.connectionStatus(),
                connectionChanged ? null : current.connectionSafeReason(),
                connectionChanged ? null : current.connectionDurationMs(),
                connectionChanged ? null : current.connectionTestedAt(),
                connectionChanged ? null : current.connectionCorrelationId(),
                clock.instant());
        AdminModelStore.EncryptedCredential finalEncrypted = encrypted;
        return transactions.required(() -> {
            if (finalEncrypted != null && store.insertCredential(finalEncrypted) != 1) {
                throw AdminModelMutationException.revisionConflict();
            }
            insertRevision(next);
            advance(modelId, expected, next);
            return commit(commandId, correlationId, commandDigest, actor,
                    "update_model", next, changed);
        });
    }

    private ObjectNode lifecycle(ObjectNode command, String actor, UUID commandId,
            UUID correlationId, String commandDigest) {
        requireExact(command, Set.of("kind", "contractVersion", "commandId", "correlationId",
                "modelId", "expectedModelRevision", "lifecycle", "defaultDisposition"), Set.of());
        String modelId = id(command, "modelId");
        String expected = revisionText(command, "expectedModelRevision");
        String lifecycle = text(command, "lifecycle", 20);
        if (!(lifecycle.equals("enabled") || lifecycle.equals("disabled"))) {
            throw AdminModelMutationException.invalidRequest();
        }
        AdminManagedModel current = expected(modelId, expected);
        ObjectNode disposition = object(command, "defaultDisposition");
        String mode = text(disposition, "mode", 30);
        AdminManagedModel next = revision(modelId, current.displayName(), current.providerFamily(),
                current.endpoint(), current.providerModelId(), lifecycle,
                current.credentialReference(), current.credentialRevision(), current.connectionStatus(),
                current.connectionSafeReason(), current.connectionDurationMs(),
                current.connectionTestedAt(), current.connectionCorrelationId(), clock.instant());
        return transactions.required(() -> {
            if (lifecycle.equals("enabled") && !mode.equals("unchanged")) {
                throw AdminModelMutationException.invalidRequest();
            }
            if (lifecycle.equals("enabled") && !next.credentialConfigured()) {
                throw AdminModelMutationException.businessRule("配置访问凭据后才能启用模型。");
            }
            if (lifecycle.equals("enabled")
                    && !current.connectionStatus().equals("success")) {
                throw AdminModelMutationException.businessRule("连接测试成功后才能启用模型。");
            }
            if (lifecycle.equals("disabled")) applyDefaultDisposition(current, disposition);
            insertRevision(next);
            advance(modelId, expected, next);
            return commit(commandId, correlationId, commandDigest, actor,
                    "set_model_lifecycle", next, List.of("lifecycle"));
        });
    }

    private ObjectNode setDefault(ObjectNode command, String actor, UUID commandId,
            UUID correlationId, String commandDigest) {
        requireExact(command, Set.of("kind", "contractVersion", "commandId", "correlationId",
                "modelId", "expectedModelRevision", "expectedCurrentDefault"), Set.of());
        String modelId = id(command, "modelId");
        AdminManagedModel current = expected(modelId,
                revisionText(command, "expectedModelRevision"));
        if (!current.lifecycle().equals("enabled")) {
            throw AdminModelMutationException.businessRule("只有已启用模型可以设为默认模型。");
        }
        ObjectNode expectedDefault = object(command, "expectedCurrentDefault");
        String state = text(expectedDefault, "state", 20);
        String expectedId = null;
        String expectedRevision = null;
        if (state.equals("none")) requireExact(expectedDefault, Set.of("state"), Set.of());
        else if (state.equals("model")) {
            requireExact(expectedDefault, Set.of("state", "modelId", "modelRevision"), Set.of());
            expectedId = id(expectedDefault, "modelId");
            expectedRevision = revisionText(expectedDefault, "modelRevision");
        } else throw AdminModelMutationException.invalidRequest();
        String finalExpectedId = expectedId;
        String finalExpectedRevision = expectedRevision;
        return transactions.required(() -> {
            if (store.replaceDefault(finalExpectedId, finalExpectedRevision,
                    modelId, current.modelRevision(), clock.instant()) != 1) {
                throw AdminModelMutationException.revisionConflict();
            }
            return commit(commandId, correlationId, commandDigest, actor,
                    "set_default_model", current, List.of("defaultForNewTasks"));
        });
    }

    private void applyDefaultDisposition(AdminManagedModel current, ObjectNode disposition) {
        String mode = text(disposition, "mode", 30);
        Optional<AdminModelStore.DefaultSelection> selected = store.findDefault();
        boolean isDefault = selected.map(item -> item.modelId().equals(current.modelId())
                && item.modelRevision().equals(current.modelRevision())).orElse(false);
        if (!isDefault) {
            if (!mode.equals("unchanged")) throw AdminModelMutationException.invalidRequest();
            requireExact(disposition, Set.of("mode"), Set.of());
            return;
        }
        if (mode.equals("no_default")) {
            requireExact(disposition, Set.of("mode"), Set.of());
            if (store.clearDefault(current.modelId(), current.modelRevision()) != 1) {
                throw AdminModelMutationException.revisionConflict();
            }
            return;
        }
        if (mode.equals("replace")) {
            requireExact(disposition, Set.of("mode", "replacementModelId",
                    "expectedReplacementModelRevision"), Set.of());
            String replacementId = id(disposition, "replacementModelId");
            AdminManagedModel replacement = expected(replacementId,
                    revisionText(disposition, "expectedReplacementModelRevision"));
            if (!replacement.lifecycle().equals("enabled")) {
                throw AdminModelMutationException.businessRule("替代默认模型必须处于已启用状态。");
            }
            if (store.replaceDefault(current.modelId(), current.modelRevision(), replacementId,
                    replacement.modelRevision(), clock.instant()) != 1) {
                throw AdminModelMutationException.revisionConflict();
            }
            return;
        }
        throw AdminModelMutationException.businessRule("停用默认模型前必须选择替代模型或明确取消默认。");
    }

    private ObjectNode commit(UUID commandId, UUID correlationId, String commandDigest,
            String actor, String action, AdminManagedModel model, List<String> changed) {
        ObjectNode receipt = baseReceipt(commandId, correlationId, model);
        persistReceiptAndAudit(commandId, correlationId, commandDigest, actor,
                action, model, changed, receipt);
        return receipt;
    }

    private static ObjectNode baseReceipt(
            UUID commandId, UUID correlationId, AdminManagedModel model) {
        ObjectNode receipt = JSON.createObjectNode();
        receipt.put("kind", "admin_model_mutation_receipt");
        receipt.put("contractVersion", CONTRACT_VERSION);
        receipt.put("commandId", commandId.toString());
        receipt.put("correlationId", correlationId.toString());
        receipt.put("modelId", model.modelId());
        receipt.put("modelRevision", model.modelRevision());
        receipt.put("result", "committed");
        receipt.put("replayed", false);
        return receipt;
    }

    private void persistReceiptAndAudit(UUID commandId, UUID correlationId,
            String commandDigest, String actor, String action, AdminManagedModel model,
            List<String> changed, ObjectNode receipt) {
        String resultJson = CanonicalJson.canonicalize(receipt);
        if (store.insertReceipt(new AdminModelStore.CommandReceipt(commandId, correlationId,
                commandDigest, resultJson, clock.instant())) != 1) {
            throw AdminModelMutationException.revisionConflict();
        }
        store.insertAudit(new AdminModelStore.AuditEvent(UUID.randomUUID(), actor, action,
                model.modelId(), model.modelRevision(), changed, clock.instant(),
                "committed", correlationId));
    }

    private void insertRevision(AdminManagedModel model) {
        ObjectNode json = toJson(model);
        String canonical = CanonicalJson.canonicalize(json);
        if (store.insertRevision(model, canonical, CanonicalJson.sha256(canonical)) != 1) {
            throw AdminModelMutationException.revisionConflict();
        }
    }

    private void advance(String modelId, String expected, AdminManagedModel next) {
        if (store.advanceHead(modelId, expected, next.modelRevision(), next.createdAt()) != 1) {
            throw AdminModelMutationException.revisionConflict();
        }
        Optional<AdminModelStore.DefaultSelection> selected = store.findDefault();
        if (selected.isPresent()
                && selected.get().modelId().equals(modelId)
                && selected.get().modelRevision().equals(expected)
                && store.replaceDefault(modelId, expected, modelId,
                        next.modelRevision(), next.createdAt()) != 1) {
            throw AdminModelMutationException.revisionConflict();
        }
    }

    private AdminManagedModel expected(String modelId, String expectedRevision) {
        AdminManagedModel current = get(modelId);
        if (!current.modelRevision().equals(expectedRevision)) {
            throw AdminModelMutationException.revisionConflict();
        }
        return current;
    }

    private static AdminManagedModel revision(String modelId, String displayName,
            String providerFamily, String endpoint, String providerModelId, String lifecycle,
            String credentialReference, String credentialRevision, String status, String safeReason,
            Long duration, Instant testedAt, UUID checkCorrelationId, Instant createdAt) {
        ObjectNode material = JSON.createObjectNode();
        material.put("modelId", modelId); material.put("displayName", displayName);
        material.put("providerFamily", providerFamily); material.put("endpoint", endpoint);
        material.put("providerModelId", providerModelId); material.put("lifecycle", lifecycle);
        if (credentialReference != null) material.put("credentialReference", credentialReference);
        if (credentialRevision != null) material.put("credentialRevision", credentialRevision);
        material.put("connectionStatus", status);
        if (safeReason != null) material.put("connectionSafeReason", safeReason);
        if (duration != null) material.put("connectionDurationMs", duration);
        if (testedAt != null) material.put("connectionTestedAt", testedAt.toString());
        if (checkCorrelationId != null) material.put("connectionCorrelationId", checkCorrelationId.toString());
        String revision = "sha256:" + CanonicalJson.sha256(CanonicalJson.canonicalize(material));
        return new AdminManagedModel(modelId, revision, displayName, providerFamily, endpoint,
                providerModelId, lifecycle, credentialReference, credentialRevision, status,
                safeReason, duration, testedAt, checkCorrelationId, createdAt);
    }

    public static ObjectNode toJson(AdminManagedModel model) {
        ObjectNode node = JSON.createObjectNode();
        node.put("modelId", model.modelId()); node.put("modelRevision", model.modelRevision());
        node.put("displayName", model.displayName()); node.put("providerFamily", model.providerFamily());
        node.put("endpoint", model.endpoint()); node.put("providerModelId", model.providerModelId());
        node.put("lifecycle", model.lifecycle());
        if (model.credentialReference() != null) node.put("credentialReference", model.credentialReference());
        if (model.credentialRevision() != null) node.put("credentialRevision", model.credentialRevision());
        node.put("connectionStatus", model.connectionStatus());
        if (model.connectionSafeReason() != null) node.put("connectionSafeReason", model.connectionSafeReason());
        if (model.connectionDurationMs() != null) node.put("connectionDurationMs", model.connectionDurationMs());
        if (model.connectionTestedAt() != null) node.put("connectionTestedAt", model.connectionTestedAt().toString());
        if (model.connectionCorrelationId() != null) node.put("connectionCorrelationId", model.connectionCorrelationId().toString());
        node.put("createdAt", model.createdAt().toString());
        return node;
    }

    public static AdminManagedModel fromJson(String raw) {
        ObjectNode node = CanonicalJson.parseObject(raw, 32_768);
        return new AdminManagedModel(text(node, "modelId", 200), revisionText(node, "modelRevision"),
                text(node, "displayName", 128), text(node, "providerFamily", 40),
                text(node, "endpoint", 2048), text(node, "providerModelId", 256),
                text(node, "lifecycle", 20), nullableText(node, "credentialReference"),
                nullableText(node, "credentialRevision"), text(node, "connectionStatus", 40),
                nullableText(node, "connectionSafeReason"), nullableLong(node, "connectionDurationMs"),
                nullableInstant(node, "connectionTestedAt"), nullableUuid(node, "connectionCorrelationId"),
                Instant.parse(text(node, "createdAt", 80)));
    }

    private static String optionalText(ObjectNode node, String field, int maximum,
            String fallback, List<String> changed) {
        if (!node.has(field)) return fallback;
        String value = text(node, field, maximum);
        if (!value.equals(fallback)) changed.add(field);
        return value;
    }
    private static String optionalEndpoint(ObjectNode node, String field, String fallback,
            List<String> changed) {
        if (!node.has(field)) return fallback;
        String value = endpoint(node, field);
        if (!value.equals(fallback)) changed.add(field);
        return value;
    }
    private static ObjectNode object(ObjectNode node, String field) {
        if (!(node.get(field) instanceof ObjectNode value)) throw AdminModelMutationException.invalidRequest();
        return value;
    }
    private static String text(ObjectNode node, String field, int maximum) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()
                || value.textValue().length() > maximum) throw AdminModelMutationException.invalidRequest();
        return value.textValue();
    }
    private static String nullableText(ObjectNode node, String field) {
        return node.has(field) ? text(node, field, 2048) : null;
    }
    private static Long nullableLong(ObjectNode node, String field) {
        return node.has(field) && node.get(field).canConvertToLong() ? node.get(field).longValue() : null;
    }
    private static Instant nullableInstant(ObjectNode node, String field) {
        return node.has(field) ? Instant.parse(text(node, field, 80)) : null;
    }
    private static UUID nullableUuid(ObjectNode node, String field) {
        return node.has(field) ? uuid(node, field) : null;
    }
    private static String exact(ObjectNode node, String field, String expected) {
        String value = text(node, field, 80);
        if (!value.equals(expected)) throw AdminModelMutationException.invalidRequest();
        return value;
    }
    private static String endpoint(ObjectNode node, String field) {
        String value = text(node, field, 2048);
        try {
            URI uri = URI.create(value);
            boolean secure = uri.getScheme().equals("https");
            boolean testLoopback = uri.getScheme().equals("http")
                    && ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost())
                            || "::1".equals(uri.getHost()));
            if ((!secure && !testLoopback) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null) {
                throw AdminModelMutationException.invalidRequest();
            }
        } catch (IllegalArgumentException exception) {
            throw AdminModelMutationException.invalidRequest();
        }
        return value;
    }
    private static char[] secret(ObjectNode node, String field) {
        String value = text(node, field, 16_384);
        char[] chars = value.toCharArray();
        for (char item : chars) if (item < 0x21 || item > 0x7e) {
            Arrays.fill(chars, '\0'); throw AdminModelMutationException.invalidRequest();
        }
        return chars;
    }
    private static String id(ObjectNode node, String field) {
        String value = text(node, field, 200);
        if (!value.matches("^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$"))
            throw AdminModelMutationException.invalidRequest();
        return value;
    }
    private static String revisionText(ObjectNode node, String field) {
        String value = text(node, field, 71);
        if (!value.matches("^sha256:[a-f0-9]{64}$")) throw AdminModelMutationException.invalidRequest();
        return value;
    }
    private static UUID uuid(ObjectNode node, String field) {
        try { return UUID.fromString(text(node, field, 36)); }
        catch (RuntimeException exception) { throw AdminModelMutationException.invalidRequest(); }
    }
    private static void requireExact(ObjectNode node, Set<String> allowed, Set<String> ignored) {
        Set<String> names = new HashSet<>(); node.fieldNames().forEachRemaining(names::add);
        if (!allowed.containsAll(names) || !names.containsAll(allowed.stream()
                .filter(field -> !ignored.contains(field)).toList())) {
            throw AdminModelMutationException.invalidRequest();
        }
    }
}
