package com.robothree.central.persistence;

public final class PersistenceConflictException extends RuntimeException {

    private final String code;

    public PersistenceConflictException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
