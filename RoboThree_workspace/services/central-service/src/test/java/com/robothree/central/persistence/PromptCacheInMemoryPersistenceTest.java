package com.robothree.central.persistence;

import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import org.junit.jupiter.api.Test;

class PromptCacheInMemoryPersistenceTest {

    @Test
    void matchesPromptCachePersistenceConformance() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        PromptCachePersistenceConformance.verify(
                persistence,
                persistence,
                persistence,
                persistence);
    }
}
