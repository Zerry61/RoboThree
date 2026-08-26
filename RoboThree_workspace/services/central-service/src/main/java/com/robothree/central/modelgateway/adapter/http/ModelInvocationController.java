package com.robothree.central.modelgateway.adapter.http;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelInvocationGatewayService;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralObservedOperation;
import java.io.IOException;
import java.util.UUID;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping(path = "/v1alpha1/model-invocations")
@ConditionalOnBean(ModelInvocationGatewayService.class)
@RequiredArgsConstructor
public final class ModelInvocationController {

    private static final long SSE_TIMEOUT_MILLIS = 300_000;

    @NonNull
    private final ModelInvocationGatewayService service;
    @NonNull
    private final CentralObservationRunner observations;

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> accept(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @RequestBody ObjectNode document) {
        var parsed = ModelInvocationHttpMapper.parseAccept(document);
        ModelInvocation invocation = observations.observe(
                CentralObservedOperation.ACCEPT_MODEL_INVOCATION,
                () -> service.accept(
                        compactToken,
                        parsed.command(),
                        parsed.canonicalProviderRequestJson()));
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .cacheControl(CacheControl.noStore())
                .body(ModelInvocationHttpResponseAssembler.accepted(invocation));
    }

    @GetMapping(path = "/{invocationId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> status(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @PathVariable UUID invocationId) {
        ModelInvocation invocation = observations.observe(
                CentralObservedOperation.READ_MODEL_INVOCATION,
                () -> service.status(compactToken, invocationId));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ModelInvocationHttpResponseAssembler.status(invocation));
    }

    @PostMapping(
            path = "/{invocationId}/cancel",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> cancel(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @PathVariable UUID invocationId,
            @RequestBody ObjectNode document) {
        var command = ModelInvocationHttpMapper.parseCancel(document);
        ModelInvocation invocation = observations.observe(
                CentralObservedOperation.CANCEL_MODEL_INVOCATION,
                () -> service.cancel(
                        compactToken,
                        invocationId,
                        command.expectedStatusRevision(),
                        command.reason()));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ModelInvocationHttpResponseAssembler.status(invocation));
    }

    @GetMapping(path = "/{invocationId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken,
            @PathVariable UUID invocationId,
            @RequestParam(required = false) String cursor) {
        long afterSequence = ModelInvocationHttpMapper.parseDurableCursor(cursor);
        var subscription = observations.observe(
                CentralObservedOperation.STREAM_MODEL_INVOCATION,
                () -> service.subscribe(compactToken, invocationId, afterSequence));
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
        emitter.onCompletion(subscription::close);
        emitter.onTimeout(subscription::close);
        emitter.onError(ignored -> subscription.close());
        Thread.ofVirtual()
                .name("robothree-model-sse-" + invocationId)
                .start(() -> pump(invocationId, afterSequence, subscription, emitter));
        return emitter;
    }

    private static void pump(
            UUID invocationId,
            long initialSequence,
            ModelInvocationGatewayService.LiveSubscription subscription,
            SseEmitter emitter) {
        long durableSequence = initialSequence;
        long lastHeartbeat = System.nanoTime();
        try (subscription) {
            for (var event : subscription.initialDurableEvents()) {
                emitter.send(SseEmitter.event()
                        .name("model")
                        .id(ModelInvocationHttpResponseAssembler.cursor(
                                event.eventSequence(),
                                event.streamDigest()))
                        .data(ModelInvocationHttpResponseAssembler.durable(event)));
                durableSequence = event.eventSequence();
            }
            while (true) {
                if (subscription.continuityLost()) {
                    throw ModelGatewayException.unavailable(
                            "model_stream_resume_unavailable",
                            "The complete live Model output is no longer available.");
                }
                var ephemeral = subscription.poll(250);
                if (ephemeral != null) {
                    emitter.send(SseEmitter.event()
                            .name("model")
                            .data(ModelInvocationHttpResponseAssembler.ephemeral(
                                    invocationId,
                                    ephemeral)));
                }
                for (var event : subscription.durableAfter(durableSequence)) {
                    emitter.send(SseEmitter.event()
                            .name("model")
                            .id(ModelInvocationHttpResponseAssembler.cursor(
                                    event.eventSequence(),
                                    event.streamDigest()))
                            .data(ModelInvocationHttpResponseAssembler.durable(event)));
                    durableSequence = event.eventSequence();
                }
                ModelInvocation status = subscription.currentStatus();
                if (status.status().isTerminal()
                        && durableSequence >= status.lastDurableEventSequence()
                        && ephemeral == null) {
                    emitter.complete();
                    return;
                }
                if (System.nanoTime() - lastHeartbeat >= 15_000_000_000L) {
                    emitter.send(SseEmitter.event().comment("heartbeat"));
                    lastHeartbeat = System.nanoTime();
                }
            }
        } catch (IOException ignored) {
            // Transport disconnect is not a durable cancellation decision.
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException exception) {
            emitter.completeWithError(exception);
        }
    }

}
