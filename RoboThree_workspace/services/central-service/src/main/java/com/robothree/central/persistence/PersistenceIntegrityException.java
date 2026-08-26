package com.robothree.central.persistence;

public final class PersistenceIntegrityException extends RuntimeException {

    private final String code;

    public PersistenceIntegrityException(String code, String message) {
        super(message);
        this.code = code;
    }

    public PersistenceIntegrityException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
