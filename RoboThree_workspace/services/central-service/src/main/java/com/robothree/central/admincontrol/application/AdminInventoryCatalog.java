package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class AdminInventoryCatalog {

    private final Map<AdminModule, AdminModuleInventorySource> sources;

    public AdminInventoryCatalog(List<AdminModuleInventorySource> sources) {
        Objects.requireNonNull(sources, "sources");
        EnumMap<AdminModule, AdminModuleInventorySource> indexed =
                new EnumMap<>(AdminModule.class);
        for (AdminModuleInventorySource source : sources) {
            Objects.requireNonNull(source, "source");
            if (indexed.putIfAbsent(source.module(), source) != null) {
                throw new IllegalArgumentException("admin.inventory_source_ambiguous");
            }
        }
        if (indexed.size() != AdminModule.values().length) {
            throw new IllegalArgumentException("admin.inventory_source_incomplete");
        }
        this.sources = Map.copyOf(indexed);
    }

    public AdminModuleInventoryLease capture(AdminModule module, Instant now) {
        AdminModuleInventoryLease lease = sources.get(module).capture(now);
        if (lease.module() != module || !lease.capturedAt().equals(now)) {
            throw new IllegalStateException("admin.inventory_lease_mismatch");
        }
        lease.items().forEach(item -> AdminProjectionContractValidator.validate(module, item));
        return lease;
    }
}
