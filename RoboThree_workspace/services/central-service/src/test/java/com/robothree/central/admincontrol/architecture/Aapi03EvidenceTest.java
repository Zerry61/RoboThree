package com.robothree.central.admincontrol.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.adapter.http.AdminReadHttpController;
import com.robothree.central.admincontrol.application.AdminInventoryCatalog;
import com.robothree.central.admincontrol.application.AdminModuleInventorySource;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import com.robothree.central.admincontrol.application.AdminReadProjectionServiceTest;
import com.robothree.central.admincontrol.configuration.AdminCapabilityProjectionConfiguration;
import com.robothree.central.admincontrol.configuration.AdminReadHttpConfiguration;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

class Aapi03EvidenceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void writesRuntimeProductionExclusionAndRouteEvidenceWhenRequested() throws Exception {
        int getRoutes = (int) Arrays.stream(AdminReadHttpController.class.getDeclaredMethods())
                .filter(method -> method.isAnnotationPresent(GetMapping.class))
                .count();
        int mutationRoutes = (int) Arrays.stream(AdminReadHttpController.class.getDeclaredMethods())
                .filter(method -> method.isAnnotationPresent(PostMapping.class)
                        || method.isAnnotationPresent(PutMapping.class)
                        || method.isAnnotationPresent(PatchMapping.class)
                        || method.isAnnotationPresent(DeleteMapping.class))
                .count();
        int[] productionCounts = new int[3];
        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("production"))
                .withPropertyValues("robothree.admin-api.test-read-shell-enabled=true")
                .withBean(AdminInventoryCatalog.class, AdminReadProjectionServiceTest::catalog)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    productionCounts[0] = context.getBeansOfType(AdminReadHttpController.class).size();
                    productionCounts[1] = context.getBeansOfType(AdminReadProjectionService.class).size();
                    productionCounts[2] = context.getBeansOfType(AdminModuleInventorySource.class).size();
                });

        assertThat(getRoutes).isEqualTo(12);
        assertThat(mutationRoutes).isZero();
        assertThat(productionCounts).containsOnly(0);

        String output = System.getenv("ROBOTHREE_AAPI03_BOUNDARY_EVIDENCE_PATH");
        if (output != null && !output.isBlank()) {
            ObjectNode evidence = JSON.createObjectNode();
            evidence.put("getRouteCount", getRoutes);
            evidence.put("mutationRouteCount", mutationRoutes);
            evidence.put("productionControllerBeanCount", productionCounts[0]);
            evidence.put("productionMappingCount", productionCounts[1]);
            evidence.put("productionTestInventorySourceCount", productionCounts[2]);
            evidence.put("testIdentityUsed", true);
            evidence.put("productionIdentityReady", false);
            evidence.put("productionAdminReadHttpReady", false);
            evidence.put("browserSecurityReady", false);
            evidence.put("adminAdapterReady", false);
            evidence.put("tgmReady", false);
            evidence.put("knowledgeProviderReady", false);
            evidence.put("agentLifecycleReady", false);
            Files.writeString(Path.of(output), evidence.toString());
        }
    }
}
