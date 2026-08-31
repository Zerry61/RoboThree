package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public final class AdminModelCredentialEntity {
    private String credentialReference;
    private String modelId;
    private String credentialRevision;
    private String keyId;
    private byte[] nonce;
    private byte[] ciphertext;
    private Instant createdAt;

    public String getCredentialReference() { return credentialReference; }
    public void setCredentialReference(String value) { credentialReference = value; }
    public String getModelId() { return modelId; }
    public void setModelId(String value) { modelId = value; }
    public String getCredentialRevision() { return credentialRevision; }
    public void setCredentialRevision(String value) { credentialRevision = value; }
    public String getKeyId() { return keyId; }
    public void setKeyId(String value) { keyId = value; }
    public byte[] getNonce() { return nonce == null ? null : nonce.clone(); }
    public void setNonce(byte[] value) { nonce = value == null ? null : value.clone(); }
    public byte[] getCiphertext() { return ciphertext == null ? null : ciphertext.clone(); }
    public void setCiphertext(byte[] value) { ciphertext = value == null ? null : value.clone(); }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt = value; }
}
