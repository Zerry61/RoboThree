package com.robothree.central.persistence.port;

import java.util.function.Supplier;

public interface CentralTransactionRunner {

    <T> T required(Supplier<T> work);
}
