package com.robothree.central.authentication.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.IssueEnterpriseSessionChallengeService;
import com.robothree.central.authentication.application.IssueEnterpriseSessionLeaseService;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(
        path = "/enterprise-session/v1alpha1",
        produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnProperty(
        name = "robothree.enterprise-session.enabled",
        havingValue = "true")
@ConditionalOnBean({
    IssueEnterpriseSessionChallengeService.class,
    IssueEnterpriseSessionLeaseService.class
})
@RequiredArgsConstructor
public final class EnterpriseSessionController {

    @NonNull
    private final IssueEnterpriseSessionChallengeService challengeService;
    @NonNull
    private final IssueEnterpriseSessionLeaseService leaseService;
    @NonNull
    private final ObjectMapper objectMapper;

    @PostMapping(
            path = "/device-challenges",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EnterpriseSessionHttpModels.DeviceChallengeResponse> challenge(
            @RequestHeader(HttpHeaders.CONTENT_TYPE) String contentType,
            @RequestBody byte[] body) {
        requireJsonUtf8(contentType);
        var mapper = new EnterpriseSessionHttpMapper(objectMapper);
        var request = mapper.parseChallengeRequest(body);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(mapper.challengeResponse(
                        challengeService.issue(mapper.challengeCommand(request))));
    }

    @PostMapping(
            path = "/session-leases",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EnterpriseSessionHttpModels.SessionLeaseResponse> lease(
            @RequestHeader(HttpHeaders.CONTENT_TYPE) String contentType,
            @RequestBody byte[] body) {
        requireJsonUtf8(contentType);
        var mapper = new EnterpriseSessionHttpMapper(objectMapper);
        var request = mapper.parseLeaseRequest(body);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(mapper.leaseResponse(leaseService.issue(mapper.leaseCommand(request))));
    }

    private static void requireJsonUtf8(String contentType) {
        MediaType mediaType = MediaType.parseMediaType(contentType);
        if (!MediaType.APPLICATION_JSON.includes(mediaType)
                || (mediaType.getCharset() != null
                        && !java.nio.charset.StandardCharsets.UTF_8.equals(mediaType.getCharset()))) {
            throw new IllegalArgumentException("Enterprise Session content type is unsupported");
        }
    }
}
