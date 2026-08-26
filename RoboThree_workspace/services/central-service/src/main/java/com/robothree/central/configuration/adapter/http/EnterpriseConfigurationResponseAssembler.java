package com.robothree.central.configuration.adapter.http;

import com.robothree.central.configuration.application.ConfigurationReadService.ConfigurationReadResult;
import com.robothree.central.configuration.application.ConfigurationReadService.PackageReadResult;
import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

final class EnterpriseConfigurationResponseAssembler {

    private EnterpriseConfigurationResponseAssembler() {}

    static ResponseEntity<byte[]> from(ConfigurationReadResult result) {
        return assemble(result.notModified(), result.documentJson(), result.etag());
    }

    static ResponseEntity<byte[]> from(PackageReadResult result) {
        return assemble(result.notModified(), result.documentJson(), result.etag());
    }

    private static ResponseEntity<byte[]> assemble(
            boolean notModified,
            String documentJson,
            String etag) {
        if (notModified) {
            return ResponseEntity.status(304)
                    .header(HttpHeaders.ETAG, etag)
                    .cacheControl(CacheControl.noStore())
                    .build();
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.ETAG, etag)
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_JSON)
                .body(documentJson.getBytes(StandardCharsets.UTF_8));
    }
}
