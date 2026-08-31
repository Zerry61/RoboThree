package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.application.EnterpriseReasoningMappingRelease;
import java.util.List;

public interface EnterpriseReasoningMappingSource {
    List<EnterpriseReasoningMappingRelease> loadExact(
            String mappingRevision,
            String mappingDigest);
}

