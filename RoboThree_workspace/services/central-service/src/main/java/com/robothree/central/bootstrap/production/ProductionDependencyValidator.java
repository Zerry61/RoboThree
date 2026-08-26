package com.robothree.central.bootstrap.production;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.ListableBeanFactory;

public final class ProductionDependencyValidator {

    private static final String CENTRAL_PACKAGE = "com.robothree.central.";

    private final ListableBeanFactory beanFactory;
    private final ProductionDependencyManifest manifest;

    public ProductionDependencyValidator(
            ListableBeanFactory beanFactory,
            ProductionDependencyManifest manifest) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        this.manifest = Objects.requireNonNull(manifest, "manifest");
    }

    public void validate() {
        for (ProductionDependencyManifest.Requirement requirement :
                manifest.requirements()) {
            String[] candidates =
                    beanFactory.getBeanNamesForType(requirement.type(), false, false);
            if (candidates.length == 0) {
                throw startup(
                        "central.production_dependency_missing",
                        "required production dependency is unavailable: "
                                + requirement.id());
            }
            if (candidates.length != 1) {
                throw startup(
                        "central.production_dependency_ambiguous",
                        "required production dependency is ambiguous: "
                                + requirement.id());
            }
        }
        rejectForbiddenCentralBeans();
    }

    private void rejectForbiddenCentralBeans() {
        Set<String> beanNames =
                new LinkedHashSet<>(Arrays.asList(beanFactory.getBeanDefinitionNames()));
        beanNames.addAll(Arrays.asList(
                beanFactory.getBeanNamesForType(Object.class, false, false)));
        for (String beanName : beanNames) {
            Class<?> type = beanFactory.getType(beanName, false);
            if (type == null || !type.getName().startsWith(CENTRAL_PACKAGE)) {
                continue;
            }
            String name = type.getName();
            String simpleName = type.getSimpleName().toLowerCase(Locale.ROOT);
            boolean forbidden = name.contains(".persistence.memory.")
                    || name.contains(".support.")
                    || name.contains(".foundation.Fake")
                    || simpleName.startsWith("fake")
                    || simpleName.startsWith("inmemory")
                    || simpleName.contains("development");
            if (forbidden) {
                throw startup(
                        "central.production_forbidden_dependency",
                        "non-production dependency is present in the production graph");
            }
        }
    }

    private static CentralProductionStartupException startup(String code, String message) {
        return new CentralProductionStartupException(code, message);
    }

    @Override
    public String toString() {
        return "ProductionDependencyValidator[manifest="
                + ProductionDependencyManifest.VERSION
                + ",requirements="
                + Arrays.toString(manifest.requirements().stream()
                        .map(ProductionDependencyManifest.Requirement::id)
                        .toArray())
                + "]";
    }
}
