package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import java.sql.SQLException;
import java.util.function.IntSupplier;

final class MyBatisPersistenceErrors {

    private MyBatisPersistenceErrors() {}

    static int write(
            IntSupplier work,
            String conflictCode,
            String integrityCode) {
        try {
            return work.getAsInt();
        } catch (RuntimeException exception) {
            if (hasIntegritySqlState(exception)) {
                PersistenceConflictException mapped =
                        new PersistenceConflictException(
                                conflictCode,
                                "persistence constraint rejected the requested write");
                mapped.initCause(exception);
                throw mapped;
            }
            PersistenceIntegrityException mapped =
                    new PersistenceIntegrityException(
                            integrityCode,
                            "persistence operation could not be completed");
            mapped.initCause(exception);
            throw mapped;
        }
    }

    private static boolean hasIntegritySqlState(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SQLException sqlException
                    && sqlException.getSQLState() != null
                    && sqlException.getSQLState().startsWith("23")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
