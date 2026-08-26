package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;

public interface ModelStreamSink {

    void accept(ModelProviderStreamEvent event);

    boolean cancellationRequested();
}
