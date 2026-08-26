package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.application.AdminPrincipalProvider;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.ListableBeanFactory;

public final class AdminControlProductionGraphGuard {

    private final ListableBeanFactory beanFactory;
    private final boolean productionProfile;

    public AdminControlProductionGraphGuard(
            ListableBeanFactory beanFactory,
            boolean productionProfile) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        this.productionProfile = productionProfile;
    }

    public void validate() {
        if (!productionProfile) {
            return;
        }
        String[] providerNames =
                beanFactory.getBeanNamesForType(AdminPrincipalProvider.class, false, false);
        if (providerNames.length == 0) {
            return;
        }
        Arrays.stream(providerNames).forEach(this::rejectProvider);
    }

    private void rejectProvider(String beanName) {
        Class<?> implementation = beanFactory.getType(beanName, false);
        if (implementation == null) {
            throw startup(
                    "central.admin_control_principal_provider_unresolved",
                    "Admin Control principal provider type is unresolved");
        }
        String simple = implementation.getSimpleName().toLowerCase(Locale.ROOT);
        String qualified = implementation.getName().toLowerCase(Locale.ROOT);
        boolean forbidden = qualified.contains(".support.")
                || qualified.contains(".test.")
                || qualified.contains(".persistence.memory.")
                || simple.startsWith("fake")
                || simple.startsWith("fixed")
                || simple.startsWith("inmemory")
                || simple.contains("deterministic")
                || simple.contains("development");
        if (forbidden || AdminPrincipalProvider.class.isAssignableFrom(implementation)) {
            throw startup(
                    "central.admin_control_principal_provider_forbidden_in_production",
                    "Admin Control principal provider is not available for production");
        }
    }

    private static CentralProductionStartupException startup(String code, String message) {
        return new CentralProductionStartupException(code, message);
    }
}
