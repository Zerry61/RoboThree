package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public final class AdminModelGatewayBindingEntity {
    private String decisionDigest;
    private String bindingRevision;
    private String bindingDigest;
    private String bindingJson;
    private Instant createdAt;

    public String getDecisionDigest() { return decisionDigest; }
    public void setDecisionDigest(String value) { decisionDigest = value; }
    public String getBindingRevision() { return bindingRevision; }
    public void setBindingRevision(String value) { bindingRevision = value; }
    public String getBindingDigest() { return bindingDigest; }
    public void setBindingDigest(String value) { bindingDigest = value; }
    public String getBindingJson() { return bindingJson; }
    public void setBindingJson(String value) { bindingJson = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt = value; }
}
