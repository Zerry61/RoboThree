package com.robothree.central.persistence.mybatis.transaction;

import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralObservedOperation;
import java.util.Objects;
import java.util.function.Supplier;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public final class SpringCentralTransactionRunner implements CentralTransactionRunner {

    private final TransactionTemplate transactionTemplate;
    private final CentralObservationRunner observations;

    public SpringCentralTransactionRunner(PlatformTransactionManager transactionManager) {
        this(transactionManager, CentralObservationRunner.noop());
    }

    public SpringCentralTransactionRunner(
            PlatformTransactionManager transactionManager,
            CentralObservationRunner observations) {
        this.observations = Objects.requireNonNull(observations, "observations");
        transactionTemplate =
                new TransactionTemplate(
                        Objects.requireNonNull(transactionManager, "transactionManager"));
        transactionTemplate.setPropagationBehavior(
                TransactionDefinition.PROPAGATION_REQUIRED);
    }

    @Override
    public <T> T required(Supplier<T> work) {
        Objects.requireNonNull(work, "work");
        return observations.observe(
                CentralObservedOperation.JDBC_TRANSACTION,
                () -> transactionTemplate.execute(status -> work.get()));
    }
}
