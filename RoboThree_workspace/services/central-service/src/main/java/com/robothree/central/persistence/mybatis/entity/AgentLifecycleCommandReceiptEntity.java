package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.UUID;

public class AgentLifecycleCommandReceiptEntity {
    private UUID commandId;
    private UUID correlationId;
    private String commandDigest;
    private String resultJson;
    private Instant occurredAt;
    public UUID getCommandId() { return commandId; }
    public void setCommandId(UUID value) { commandId = value; }
    public UUID getCorrelationId() { return correlationId; }
    public void setCorrelationId(UUID value) { correlationId = value; }
    public String getCommandDigest() { return commandDigest; }
    public void setCommandDigest(String value) { commandDigest = value; }
    public String getResultJson() { return resultJson; }
    public void setResultJson(String value) { resultJson = value; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant value) { occurredAt = value; }
}
