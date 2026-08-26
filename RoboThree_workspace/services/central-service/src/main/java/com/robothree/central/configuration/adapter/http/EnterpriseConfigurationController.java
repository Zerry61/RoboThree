package com.robothree.central.configuration.adapter.http;

import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralObservedOperation;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/v1alpha1", produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnBean(ConfigurationReadService.class)
@RequiredArgsConstructor
public final class EnterpriseConfigurationController {

    @NonNull
    private final ConfigurationReadService configurationService;
    @NonNull
    private final CentralObservationRunner observations;

    @GetMapping("/configuration")
    public ResponseEntity<byte[]> configuration(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false)
                    String ifNoneMatch) {
        var result = observations.observe(
                CentralObservedOperation.READ_CONFIGURATION,
                () -> configurationService.read(compactToken, ifNoneMatch));
        return EnterpriseConfigurationResponseAssembler.from(result);
    }

    @GetMapping(
            "/configuration/{snapshotId}/revisions/{snapshotRevision}"
                    + "/packages/{kind}/{packageId}/revisions/{packageRevision}")
    public ResponseEntity<byte[]> packageDocument(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false)
                    String ifNoneMatch,
            @PathVariable String snapshotId,
            @PathVariable String snapshotRevision,
            @PathVariable String kind,
            @PathVariable String packageId,
            @PathVariable String packageRevision,
            @RequestParam String snapshotDigest,
            @RequestParam String packageDigest) {
        var reference = EnterpriseConfigurationHttpMapper.toExactPackageReference(
                snapshotId,
                snapshotRevision,
                snapshotDigest,
                packageId,
                kind,
                packageRevision,
                packageDigest);
        var result = observations.observe(
                CentralObservedOperation.READ_PACKAGE,
                () -> configurationService.readPackage(
                        compactToken,
                        reference,
                        ifNoneMatch));
        return EnterpriseConfigurationResponseAssembler.from(result);
    }
}
