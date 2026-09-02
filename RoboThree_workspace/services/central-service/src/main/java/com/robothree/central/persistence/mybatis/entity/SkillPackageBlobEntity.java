package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public final class SkillPackageBlobEntity {
    private String packageDigest;
    private String archiveDigest;
    private String manifestDigest;
    private String skillMarkdownDigest;
    private String technicalName;
    private int fileCount;
    private long expandedByteCount;
    private byte[] canonicalZipBytes;
    private Instant createdAt;

    public String getPackageDigest() { return packageDigest; }
    public void setPackageDigest(String value) { packageDigest = value; }
    public String getArchiveDigest() { return archiveDigest; }
    public void setArchiveDigest(String value) { archiveDigest = value; }
    public String getManifestDigest() { return manifestDigest; }
    public void setManifestDigest(String value) { manifestDigest = value; }
    public String getSkillMarkdownDigest() { return skillMarkdownDigest; }
    public void setSkillMarkdownDigest(String value) { skillMarkdownDigest = value; }
    public String getTechnicalName() { return technicalName; }
    public void setTechnicalName(String value) { technicalName = value; }
    public int getFileCount() { return fileCount; }
    public void setFileCount(int value) { fileCount = value; }
    public long getExpandedByteCount() { return expandedByteCount; }
    public void setExpandedByteCount(long value) { expandedByteCount = value; }
    public byte[] getCanonicalZipBytes() { return canonicalZipBytes == null ? null : canonicalZipBytes.clone(); }
    public void setCanonicalZipBytes(byte[] value) { canonicalZipBytes = value == null ? null : value.clone(); }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt = value; }
}
