package com.robothree.central.modelgateway.domain;

public enum UsageAuthority {
    CENTRAL_ENTERPRISE("central_enterprise"),
    LOCAL_PERSONAL("local_personal");

    private final String contractValue;

    UsageAuthority(String contractValue) {
        this.contractValue = contractValue;
    }

    public String contractValue() {
        return contractValue;
    }

    public static UsageAuthority fromContractValue(String value) {
        for (UsageAuthority authority : values()) {
            if (authority.contractValue.equals(value)) {
                return authority;
            }
        }
        throw new IllegalArgumentException("unknown UsageAuthority");
    }
}
