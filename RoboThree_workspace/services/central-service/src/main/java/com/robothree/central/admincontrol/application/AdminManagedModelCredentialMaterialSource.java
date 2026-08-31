package com.robothree.central.admincontrol.application;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;

/** Resolves only encrypted Admin-owned credentials and returns caller-owned chars. */
public final class AdminManagedModelCredentialMaterialSource
        implements ModelCredentialMaterialSource {
    private final AdminModelStore store;
    private final AdminModelCredentialCipher cipher;

    public AdminManagedModelCredentialMaterialSource(
            AdminModelStore store, AdminModelCredentialCipher cipher) {
        this.store = store;
        this.cipher = cipher;
    }

    @Override
    public char[] resolve(String credentialReference, String credentialRevision) {
        try {
            return cipher.decrypt(store.findCredential(
                            credentialReference,
                            AdminManagedModelGatewaySource.wireDigest(credentialRevision))
                    .orElseThrow(AdminManagedModelGatewaySource::credentialUnavailable));
        } catch (ModelGatewayException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw AdminManagedModelGatewaySource.credentialUnavailable();
        }
    }
}
