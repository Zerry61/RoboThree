package com.robothree.central.bootstrap.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.robothree.central.foundation.FakeSecretStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

class ProductionDependencyValidatorTest {

    @Test
    void failsClosedWhenAWhitelistedDependencyIsMissing() {
        DefaultListableBeanFactory beans = completeBeanFactory();
        String dataSource =
                beans.getBeanNamesForType(javax.sql.DataSource.class)[0];
        beans.removeBeanDefinition(dataSource);

        assertThatThrownBy(() -> validator(beans).validate())
                .isInstanceOfSatisfying(
                        CentralProductionStartupException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo("central.production_dependency_missing"))
                .hasMessageContaining("database.data-source");
    }

    @Test
    void failsClosedWhenAWhitelistedDependencyIsAmbiguous() {
        DefaultListableBeanFactory beans = completeBeanFactory();
        RootBeanDefinition second = new RootBeanDefinition(Object.class);
        second.setTargetType(
                com.robothree.central.authentication.port.RoboThreeAccessTokenCodec.class);
        second.setInstanceSupplier(Object::new);
        beans.registerBeanDefinition("secondTokenCodecDefinition", second);

        assertThatThrownBy(() -> validator(beans).validate())
                .isInstanceOfSatisfying(
                        CentralProductionStartupException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo("central.production_dependency_ambiguous"))
                .hasMessageContaining("token.codec");
    }

    @Test
    void rejectsKnownFakeEvenWhenTheWhitelistIsComplete() {
        DefaultListableBeanFactory beans = completeBeanFactory();
        beans.registerSingleton("developmentSecretStore", new FakeSecretStore());

        assertThatThrownBy(() -> validator(beans).validate())
                .isInstanceOfSatisfying(
                        CentralProductionStartupException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo("central.production_forbidden_dependency"))
                .hasMessageNotContaining("FakeSecretStore");
    }

    @Test
    void acceptsOneExplicitBeanForEveryManifestRequirement() {
        DefaultListableBeanFactory beans = completeBeanFactory();

        validator(beans).validate();

        assertThat(new ProductionDependencyManifest().requirements())
                .hasSizeGreaterThanOrEqualTo(10);
    }

    private static ProductionDependencyValidator validator(
            DefaultListableBeanFactory beans) {
        return new ProductionDependencyValidator(
                beans, new ProductionDependencyManifest());
    }

    private static DefaultListableBeanFactory completeBeanFactory() {
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        int sequence = 0;
        for (ProductionDependencyManifest.Requirement requirement :
                new ProductionDependencyManifest().requirements()) {
            if (beans.getBeanNamesForType(requirement.type(), false, false).length > 0) {
                continue;
            }
            RootBeanDefinition definition = new RootBeanDefinition(Object.class);
            definition.setTargetType(requirement.type());
            definition.setInstanceSupplier(Object::new);
            beans.registerBeanDefinition(
                    "productionDependency" + sequence++, definition);
        }
        return beans;
    }
}
