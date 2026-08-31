package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.application.AdminInventoryCatalog;
import com.robothree.central.admincontrol.application.AdminModuleInventorySource;
import com.robothree.central.admincontrol.application.ConfigurationBackedAdminInventorySources;
import com.robothree.central.admincontrol.application.ModelInvocationAuditInventorySource;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import java.util.ArrayList;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.ObjectProvider;

@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.admin-api.test-read-shell-enabled",
        havingValue = "true")
public class AdminReadInventoryConfiguration {

    @Bean
    AdminInventoryCatalog adminInventoryCatalog(
            ConfigurationSnapshotRepository snapshots,
            ConfigurationIntegrityVerifier integrityVerifier,
            ModelInvocationAuditOutboxRepository auditOutbox,
            ObjectProvider<AdminModelStore> adminModels) {
        var sources = new ArrayList<AdminModuleInventorySource>(
                ConfigurationBackedAdminInventorySources.create(snapshots, integrityVerifier));
        sources.add(new ModelInvocationAuditInventorySource(
                auditOutbox, adminModels.getIfAvailable()));
        return new AdminInventoryCatalog(sources);
    }
}
