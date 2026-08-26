package com.robothree.central.authentication.adapter.http;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

final class EnterpriseIdentityResponseAssembler {

    private EnterpriseIdentityResponseAssembler() {}

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(body);
    }
}
