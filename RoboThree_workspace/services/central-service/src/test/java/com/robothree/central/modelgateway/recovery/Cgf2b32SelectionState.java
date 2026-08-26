package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingVersion;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

final class Cgf2b32SelectionState {

    private final AtomicReference<BindingVersion> current =
            new AtomicReference<>(BindingVersion.V1);

    BindingVersion current() {
        return current.get();
    }

    BindingVersion select(BindingVersion version) {
        current.set(Objects.requireNonNull(version, "version"));
        return version;
    }
}
