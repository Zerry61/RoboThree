package com.robothree.central.bootstrap.production;

import java.util.Objects;

public final class CentralProductionStartupException extends IllegalStateException {

    private final String code;

    public CentralProductionStartupException(String code, String safeMessage) {
        super(Objects.requireNonNull(safeMessage, "safeMessage"));
        this.code = Objects.requireNonNull(code, "code");
    }

    public String code() {
        return code;
    }
}
