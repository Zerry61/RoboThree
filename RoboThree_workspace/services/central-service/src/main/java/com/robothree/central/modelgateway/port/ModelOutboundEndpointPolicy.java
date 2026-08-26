package com.robothree.central.modelgateway.port;

import java.net.URI;

public interface ModelOutboundEndpointPolicy {

    void validate(URI endpoint);
}
