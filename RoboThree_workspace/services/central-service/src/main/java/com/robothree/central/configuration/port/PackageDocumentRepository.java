package com.robothree.central.configuration.port;

import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import java.util.Optional;

public interface PackageDocumentRepository {

    ImmutablePackageDocument insert(ImmutablePackageDocument document);

    Optional<ImmutablePackageDocument> findPackage(String packageId, String revision);
}
