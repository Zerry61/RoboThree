package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminCapability;
import com.robothree.central.admincontrol.domain.AdminCapabilityProjection;
import com.robothree.central.admincontrol.domain.AdminCapabilityState;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleAvailability;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class AdminReadProjectionService {

    public static final String CONTRACT_VERSION = "admin-control.v1alpha1";
    private static final String QUERY_DOMAIN = "robothree.admin-control.query-inventory.v1\n";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AdminReadRequestAuthorizer authorizer;
    private final AdminInventoryCatalog catalog;
    private final HmacAdminCursorCodec cursorCodec;
    private final Clock clock;

    public AdminReadProjectionService(
            AdminReadRequestAuthorizer authorizer,
            AdminInventoryCatalog catalog,
            HmacAdminCursorCodec cursorCodec,
            Clock clock) {
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
        this.catalog = Objects.requireNonNull(catalog, "catalog");
        this.cursorCodec = Objects.requireNonNull(cursorCodec, "cursorCodec");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public AdminReadResult capabilities(UUID requestId, UUID correlationId, String ifNoneMatch) {
        Instant now = clock.instant();
        AdminCapabilityProjection projection = authorizer.currentCapabilities();
        ObjectNode data = JSON.createObjectNode();
        data.put("capabilitySetRevision", projection.capabilitySetRevision());
        ArrayNode capabilities = data.putArray("capabilities");
        for (AdminCapability capability : projection.capabilities()) {
            ObjectNode item = capabilities.addObject();
            item.put("capabilityKey", capability.key());
            item.put("state", effectiveCapabilityState(capability, now));
            capability.safeSummary().ifPresent(summary -> item.put("safeReason", summary));
        }
        String etag = quotedDigest(CanonicalJson.sha256(CanonicalJson.canonicalize(data)));
        if (etag.equals(ifNoneMatch)) {
            return AdminReadResult.notModified(etag);
        }
        return AdminReadResult.ok(envelope(requestId, correlationId, now, projection, data), etag);
    }

    public AdminReadResult list(
            AdminModule module,
            UUID requestId,
            UUID correlationId,
            String cursor,
            int requestedLimit,
            String ifNoneMatch) {
        Instant now = clock.instant();
        AdminCapabilityProjection principal = authorizer.authorize(module);
        AdminModuleInventoryLease lease = catalog.capture(module, now);
        requireReadable(lease);
        String queryRevision = queryRevision(lease);
        int limit = requestedLimit;
        int start = 0;
        List<AdminInventoryItem> ordered = ordered(lease);
        if (cursor != null) {
            HmacAdminCursorCodec.Cursor decoded = cursorCodec.decode(cursor, module, queryRevision);
            if (decoded.limit() != limit) {
                throw AdminReadException.staleCursor();
            }
            start = indexAfter(ordered, decoded.lastSortKey(), decoded.lastResourceId());
        }
        int end = Math.min(start + limit, ordered.size());
        ObjectNode page = JSON.createObjectNode();
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", queryRevision);
        ArrayNode items = page.putArray("items");
        ordered.subList(start, end).forEach(item -> items.add(item.summary()));
        if (end < ordered.size()) {
            AdminInventoryItem last = ordered.get(end - 1);
            page.put("nextCursor", cursorCodec.encode(new HmacAdminCursorCodec.Cursor(
                    module, queryRevision, last.displayName(), last.resourceId(), limit)));
        }
        String etag = pageEtag(queryRevision, cursor, ordered.subList(start, end));
        if (etag.equals(ifNoneMatch)) {
            return AdminReadResult.notModified(etag);
        }
        return AdminReadResult.ok(envelope(requestId, correlationId, now, principal, page), etag);
    }

    public AdminReadResult detail(
            AdminModule module,
            String resourceId,
            UUID requestId,
            UUID correlationId,
            String ifNoneMatch) {
        Instant now = clock.instant();
        AdminCapabilityProjection principal = authorizer.authorize(module);
        AdminModuleInventoryLease lease = catalog.capture(module, now);
        requireReadable(lease);
        AdminInventoryItem item = lease.items().stream()
                .filter(candidate -> candidate.resourceId().equals(resourceId))
                .findFirst()
                .orElseThrow(() -> lease.knownUnavailableResourceIds().contains(resourceId)
                        ? AdminReadException.serviceUnavailable()
                        : AdminReadException.notFound());
        ObjectNode detail = item.detail();
        String etag = quotedDigest(CanonicalJson.sha256(CanonicalJson.canonicalize(detail)));
        if (etag.equals(ifNoneMatch)) {
            return AdminReadResult.notModified(etag);
        }
        return AdminReadResult.ok(envelope(requestId, correlationId, now, principal, detail), etag);
    }

    private String effectiveCapabilityState(AdminCapability capability, Instant now) {
        if (!capability.key().endsWith(".read")) {
            return capability.state().wireValue();
        }
        AdminModule module = moduleForCapability(capability.key());
        if (module == null) {
            return capability.state().wireValue();
        }
        AdminModuleAvailability availability = catalog.capture(module, now).availability();
        if (capability.state() == AdminCapabilityState.GATED) return "gated";
        if (capability.state() == AdminCapabilityState.UNAVAILABLE) return "unavailable";
        return availability.wireValue();
    }

    private static AdminModule moduleForCapability(String key) {
        for (AdminModule module : AdminModule.values()) {
            if (module.readCapability().equals(key)) return module;
        }
        return null;
    }

    private static ObjectNode envelope(
            UUID requestId,
            UUID correlationId,
            Instant now,
            AdminCapabilityProjection principal,
            ObjectNode data) {
        ObjectNode envelope = JSON.createObjectNode();
        envelope.put("contractVersion", CONTRACT_VERSION);
        envelope.put("requestId", requestId.toString());
        envelope.put("correlationId", correlationId.toString());
        envelope.put("serverTime", now.toString());
        envelope.put("testIdentityUsed", principal.testIdentityUsed());
        envelope.put("productionIdentityReady", principal.productionIdentityReady());
        envelope.set("data", data);
        return envelope;
    }

    private static void requireReadable(AdminModuleInventoryLease lease) {
        if (lease.availability() == AdminModuleAvailability.GATED) {
            throw AdminReadException.businessUnavailable();
        }
        if (lease.availability() == AdminModuleAvailability.UNAVAILABLE) {
            throw AdminReadException.serviceUnavailable();
        }
    }

    private static List<AdminInventoryItem> ordered(AdminModuleInventoryLease lease) {
        ArrayList<AdminInventoryItem> result = new ArrayList<>(lease.items());
        Comparator<AdminInventoryItem> comparator = lease.module() == AdminModule.SYSTEM
                ? Comparator.comparing(AdminInventoryItem::displayName).reversed()
                        .thenComparing(AdminInventoryItem::resourceId)
                : Comparator.comparing(AdminInventoryItem::displayName)
                        .thenComparing(AdminInventoryItem::resourceId);
        result.sort(comparator);
        return List.copyOf(result);
    }

    private static int indexAfter(
            List<AdminInventoryItem> items, String displayName, String resourceId) {
        for (int index = 0; index < items.size(); index++) {
            AdminInventoryItem item = items.get(index);
            if (item.displayName().equals(displayName)
                    && item.resourceId().equals(resourceId)) {
                return index + 1;
            }
        }
        throw AdminReadException.staleCursor();
    }

    private static String queryRevision(AdminModuleInventoryLease lease) {
        ObjectNode material = JSON.createObjectNode();
        material.put("contractVersion", CONTRACT_VERSION);
        material.put("module", lease.module().wireValue());
        material.put("sourceKind", lease.sourceKind());
        material.put("sourceRevision", lease.sourceRevision());
        material.put("availability", lease.availability().wireValue());
        lease.safeReason().ifPresent(reason -> material.put("safeReason", reason));
        ArrayNode items = material.putArray("items");
        ordered(lease).forEach(item -> items.add(item.summary()));
        return "sha256:" + CanonicalJson.sha256(
                QUERY_DOMAIN + CanonicalJson.canonicalize(material));
    }

    private static String pageEtag(
            String queryRevision, String cursor, List<AdminInventoryItem> items) {
        ObjectNode material = JSON.createObjectNode();
        material.put("queryRevision", queryRevision);
        if (cursor != null) material.put("cursor", cursor);
        ArrayNode identities = material.putArray("items");
        items.forEach(item -> identities.addObject()
                .put("resourceId", item.resourceId())
                .put("resourceRevision", item.resourceRevision()));
        return quotedDigest(CanonicalJson.sha256(CanonicalJson.canonicalize(material)));
    }

    private static String quotedDigest(String rawDigest) {
        return "\"sha256:" + rawDigest + "\"";
    }
}
