#import <Foundation/Foundation.h>
#import <Security/Security.h>

static void emit(NSDictionary *value) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:&error];
  if (data == nil || error != nil) {
    fprintf(stderr, "signer_spike_json_encoding_failed\n");
    exit(2);
  }
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
}

int main(void) {
  @autoreleasepool {
    CFErrorRef accessError = NULL;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAccessControlPrivateKeyUsage,
        &accessError);
    if (access == NULL) {
      NSError *error = CFBridgingRelease(accessError);
      emit(@{
        @"status": @"unavailable",
        @"profile": @"macos_secure_enclave_p256_ecdsa_sha256_v1",
        @"stage": @"access_control",
        @"errorCode": @(error.code),
        @"privateKeyMaterialEmitted": @NO
      });
      return 0;
    }

    NSDictionary *attributes = @{
      (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
      (__bridge id)kSecAttrKeySizeInBits: @256,
      (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
      (__bridge id)kSecPrivateKeyAttrs: @{
        (__bridge id)kSecAttrIsPermanent: @NO,
        (__bridge id)kSecAttrAccessControl: (__bridge id)access
      }
    };

    CFErrorRef createError = NULL;
    SecKeyRef privateKey = SecKeyCreateRandomKey(
        (__bridge CFDictionaryRef)attributes,
        &createError);
    CFRelease(access);
    if (privateKey == NULL) {
      NSError *error = CFBridgingRelease(createError);
      emit(@{
        @"status": @"unavailable",
        @"profile": @"macos_secure_enclave_p256_ecdsa_sha256_v1",
        @"stage": @"key_creation",
        @"errorCode": @(error.code),
        @"privateKeyMaterialEmitted": @NO
      });
      return 0;
    }

    CFErrorRef exportError = NULL;
    CFDataRef privateRepresentation = SecKeyCopyExternalRepresentation(
        privateKey,
        &exportError);
    BOOL privateKeyExportable = privateRepresentation != NULL;
    if (privateRepresentation != NULL) CFRelease(privateRepresentation);
    if (exportError != NULL) CFRelease(exportError);

    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    BOOL publicKeyExportable = NO;
    if (publicKey != NULL) {
      CFErrorRef publicExportError = NULL;
      CFDataRef publicRepresentation = SecKeyCopyExternalRepresentation(
          publicKey,
          &publicExportError);
      publicKeyExportable = publicRepresentation != NULL;
      if (publicRepresentation != NULL) CFRelease(publicRepresentation);
      if (publicExportError != NULL) CFRelease(publicExportError);
    }

    NSData *message = [@"RoboThree EIPC-1.0 signer boundary probe" dataUsingEncoding:NSUTF8StringEncoding];
    CFErrorRef signError = NULL;
    CFDataRef signature = SecKeyCreateSignature(
        privateKey,
        kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
        (__bridge CFDataRef)message,
        &signError);
    BOOL signingSucceeded = signature != NULL;
    if (signature != NULL) CFRelease(signature);
    if (signError != NULL) CFRelease(signError);

    if (publicKey != NULL) CFRelease(publicKey);
    CFRelease(privateKey);

    emit(@{
      @"status": @"pass",
      @"profile": @"macos_secure_enclave_p256_ecdsa_sha256_v1",
      @"keyType": @"ECSECPrimeRandom",
      @"keySizeBits": @256,
      @"signatureAlgorithm": @"ECDSA_X9_62_SHA256",
      @"privateKeyExportable": @(privateKeyExportable),
      @"publicKeyExportable": @(publicKeyExportable),
      @"signingSucceeded": @(signingSucceeded),
      @"privateKeyMaterialEmitted": @NO,
      @"persistentKeyCreated": @NO
    });

    return privateKeyExportable || !publicKeyExportable || !signingSucceeded ? 3 : 0;
  }
}
