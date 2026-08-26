#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <unistd.h>

static NSString *safeCode(OSStatus status) {
  switch (status) {
    case errSecSuccess: return @"ok";
    case errSecItemNotFound: return @"not_found";
    case errSecDuplicateItem: return @"conflict";
    case errSecInteractionNotAllowed: return @"locked";
    case errSecAuthFailed: return @"access_denied";
    case errSecUserCanceled: return @"cancelled";
    case errSecNoSuchKeychain: return @"unavailable";
    case errSecInvalidKeychain: return @"corrupted";
    default: return @"internal";
  }
}

static void emit(BOOL ok, NSString *code, NSData *secret) {
  NSMutableDictionary *response = [@{
    @"protocolVersion": @1,
    @"ok": @(ok),
    @"code": code,
  } mutableCopy];
  if (secret != nil) response[@"secretBase64"] = [secret base64EncodedStringWithOptions:0];
  NSData *json = [NSJSONSerialization dataWithJSONObject:response options:0 error:nil];
  [[NSFileHandle fileHandleWithStandardOutput] writeData:json];
  [[NSFileHandle fileHandleWithStandardOutput] writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
}

static NSData *decodeBase64(id value) {
  if (![value isKindOfClass:[NSString class]]) return nil;
  return [[NSData alloc] initWithBase64EncodedString:value options:0];
}

static SecKeychainRef openKeychain(NSString *path, OSStatus *status) {
  SecKeychainRef keychain = NULL;
  *status = SecKeychainOpen(path.fileSystemRepresentation, &keychain);
  return keychain;
}

static BOOL requireText(id value, NSString **output) {
  if (![value isKindOfClass:[NSString class]] || [(NSString *)value length] == 0) return NO;
  *output = value;
  return YES;
}

static BOOL waitAtControlledBarrier(void) {
  const char entered = '1';
  if (write(3, &entered, 1) != 1) return NO;
  char release = 0;
  return read(4, &release, 1) == 1 && release == '1';
}

static NSMutableDictionary *modernItemQuery(NSString *service, NSString *account) {
  return [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: account,
  } mutableCopy];
}

static OSStatus findPassword(
  SecKeychainRef keychain,
  NSString *service,
  NSString *account,
  UInt32 *passwordLength,
  void **passwordData,
  SecKeychainItemRef *item
) {
  NSData *serviceData = [service dataUsingEncoding:NSUTF8StringEncoding];
  NSData *accountData = [account dataUsingEncoding:NSUTF8StringEncoding];
  return SecKeychainFindGenericPassword(
    keychain,
    (UInt32)serviceData.length,
    serviceData.bytes,
    (UInt32)accountData.length,
    accountData.bytes,
    passwordLength,
    passwordData,
    item
  );
}

int main(void) {
  @autoreleasepool {
    SecKeychainSetUserInteractionAllowed(false);
    NSData *input = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:input options:0 error:nil];
    if (![request isKindOfClass:[NSDictionary class]] || ![request[@"protocolVersion"] isEqual:@1]) {
      emit(NO, @"invalid_request", nil);
      return 1;
    }

    NSString *command = request[@"command"];
    if (![command isKindOfClass:[NSString class]]) {
      emit(NO, @"invalid_request", nil);
      return 1;
    }

    if ([command isEqualToString:@"probe_corrupted"]) {
      NSString *corruptedPath = request[@"keychainPath"];
      if (![corruptedPath isKindOfClass:[NSString class]]
          || ![[NSFileManager defaultManager] fileExistsAtPath:corruptedPath]) {
        emit(NO, @"invalid_request", nil);
        return 1;
      }
      OSStatus corruptedStatus = errSecSuccess;
      SecKeychainRef corruptedKeychain = openKeychain(corruptedPath, &corruptedStatus);
      if (corruptedStatus == errSecSuccess && corruptedKeychain != NULL) {
        SecKeychainStatus corruptedFlags = 0;
        corruptedStatus = SecKeychainGetStatus(corruptedKeychain, &corruptedFlags);
      }
      if (corruptedKeychain != NULL) CFRelease(corruptedKeychain);
      if (corruptedStatus == errSecSuccess) {
        emit(NO, @"internal", nil);
        return 1;
      }
      emit(NO, @"corrupted", nil);
      return 1;
    }

    if ([command hasPrefix:@"secitem_"]) {
      NSString *service = nil;
      NSString *account = nil;
      if (!requireText(request[@"service"], &service) || !requireText(request[@"account"], &account)) {
        emit(NO, @"invalid_request", nil);
        return 1;
      }
      NSMutableDictionary *query = modernItemQuery(service, account);
      SecKeychainRef modernKeychain = NULL;
      id maybeKeychainPath = request[@"keychainPath"];
      if (![maybeKeychainPath isKindOfClass:[NSString class]]) {
        emit(NO, @"invalid_request", nil);
        return 1;
      }
      OSStatus openStatus = errSecSuccess;
      modernKeychain = openKeychain((NSString *)maybeKeychainPath, &openStatus);
      if (openStatus != errSecSuccess || modernKeychain == NULL) {
        emit(NO, safeCode(openStatus), nil);
        return 1;
      }
      OSStatus modernStatus = errSecSuccess;
      NSData *secret = nil;
      if ([command isEqualToString:@"secitem_store"]) {
        query[(__bridge id)kSecUseKeychain] = (__bridge id)modernKeychain;
        secret = decodeBase64(request[@"secretBase64"]);
        if (secret != nil) query[(__bridge id)kSecValueData] = secret;
        modernStatus = secret == nil ? errSecParam : SecItemAdd((__bridge CFDictionaryRef)query, NULL);
        if (modernKeychain != NULL) CFRelease(modernKeychain);
        emit(modernStatus == errSecSuccess,
          modernStatus == errSecSuccess ? @"stored" : safeCode(modernStatus), nil);
        return modernStatus == errSecSuccess ? 0 : 1;
      }
      query[(__bridge id)kSecMatchSearchList] = @[(__bridge id)modernKeychain];
      if ([command isEqualToString:@"secitem_resolve"]) {
        query[(__bridge id)kSecReturnData] = @YES;
        query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
        CFTypeRef result = NULL;
        modernStatus = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
        NSData *resolved = modernStatus == errSecSuccess && result != NULL
          ? [(__bridge NSData *)result copy]
          : nil;
        if (result != NULL) CFRelease(result);
        if (modernKeychain != NULL) CFRelease(modernKeychain);
        emit(modernStatus == errSecSuccess,
          modernStatus == errSecSuccess ? @"resolved" : safeCode(modernStatus), resolved);
        return modernStatus == errSecSuccess ? 0 : 1;
      }
      if ([command isEqualToString:@"secitem_replace"]) {
        secret = decodeBase64(request[@"secretBase64"]);
        NSDictionary *update = secret == nil
          ? @{}
          : @{ (__bridge id)kSecValueData: secret };
        modernStatus = secret == nil ? errSecParam : SecItemUpdate(
          (__bridge CFDictionaryRef)query,
          (__bridge CFDictionaryRef)update
        );
        if (modernKeychain != NULL) CFRelease(modernKeychain);
        emit(modernStatus == errSecSuccess,
          modernStatus == errSecSuccess ? @"replaced" : safeCode(modernStatus), nil);
        return modernStatus == errSecSuccess ? 0 : 1;
      }
      if ([command isEqualToString:@"secitem_delete"]) {
        modernStatus = SecItemDelete((__bridge CFDictionaryRef)query);
        if (modernKeychain != NULL) CFRelease(modernKeychain);
        emit(modernStatus == errSecSuccess,
          modernStatus == errSecSuccess ? @"deleted" : safeCode(modernStatus), nil);
        return modernStatus == errSecSuccess ? 0 : 1;
      }
      if (modernKeychain != NULL) CFRelease(modernKeychain);
      emit(NO, @"invalid_request", nil);
      return 1;
    }

    NSString *path = request[@"keychainPath"];
    if (![path isKindOfClass:[NSString class]]) {
      emit(NO, @"invalid_request", nil);
      return 1;
    }

    OSStatus status = errSecSuccess;
    SecKeychainRef keychain = NULL;
    if ([command isEqualToString:@"create_test_keychain"]) {
      NSData *password = decodeBase64(request[@"keychainPasswordBase64"]);
      if (password == nil) {
        emit(NO, @"invalid_request", nil);
        return 1;
      }
      status = SecKeychainCreate(
        path.fileSystemRepresentation,
        (UInt32)password.length,
        password.bytes,
        false,
        NULL,
        &keychain
      );
      if (keychain != NULL) CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"created" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }

    keychain = openKeychain(path, &status);
    if (status != errSecSuccess || keychain == NULL) {
      emit(NO, safeCode(status), nil);
      return 1;
    }
    SecKeychainStatus keychainFlags = 0;
    OSStatus keychainStatusResult = SecKeychainGetStatus(keychain, &keychainFlags);
    BOOL keychainWasUnlocked = keychainStatusResult == errSecSuccess
      && (keychainFlags & kSecUnlockStateStatus) != 0;

    if ([command isEqualToString:@"unlock"]) {
      NSData *password = decodeBase64(request[@"keychainPasswordBase64"]);
      status = password == nil
        ? errSecParam
        : SecKeychainUnlock(keychain, (UInt32)password.length, password.bytes, true);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"unlocked" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }
    if ([command isEqualToString:@"unlock_without_password"]) {
      status = SecKeychainUnlock(keychain, 0, NULL, false);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"unlocked" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }
    if ([command isEqualToString:@"lock"]) {
      status = SecKeychainLock(keychain);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"locked" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }
    if ([command isEqualToString:@"destroy_test_keychain"]) {
      status = SecKeychainDelete(keychain);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"destroyed" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }

    NSString *service = nil;
    NSString *account = nil;
    if (!requireText(request[@"service"], &service) || !requireText(request[@"account"], &account)) {
      CFRelease(keychain);
      emit(NO, @"invalid_request", nil);
      return 1;
    }

    if ([command isEqualToString:@"store"] || [command isEqualToString:@"controlled_store"]) {
      NSData *secret = decodeBase64(request[@"secretBase64"]);
      NSString *failpoint = request[@"failpoint"];
      if ([command isEqualToString:@"controlled_store"]
          && ![failpoint isEqualToString:@"before_mutation"]
          && ![failpoint isEqualToString:@"after_mutation_before_response"]) {
        CFRelease(keychain);
        emit(NO, @"invalid_request", nil);
        return 1;
      }
      if ([failpoint isEqualToString:@"before_mutation"] && !waitAtControlledBarrier()) {
        CFRelease(keychain);
        return 2;
      }
      NSData *serviceData = [service dataUsingEncoding:NSUTF8StringEncoding];
      NSData *accountData = [account dataUsingEncoding:NSUTF8StringEncoding];
      SecKeychainItemRef item = NULL;
      status = secret == nil ? errSecParam : SecKeychainAddGenericPassword(
        keychain,
        (UInt32)serviceData.length,
        serviceData.bytes,
        (UInt32)accountData.length,
        accountData.bytes,
        (UInt32)secret.length,
        secret.bytes,
        &item
      );
      if (item != NULL) CFRelease(item);
      CFRelease(keychain);
      if ([failpoint isEqualToString:@"after_mutation_before_response"]
          && status == errSecSuccess
          && !waitAtControlledBarrier()) {
        return 2;
      }
      emit(status == errSecSuccess, status == errSecSuccess ? @"stored" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }

    UInt32 passwordLength = 0;
    void *passwordData = NULL;
    SecKeychainItemRef item = NULL;
    status = findPassword(keychain, service, account, &passwordLength, &passwordData, &item);
    if (status != errSecSuccess || item == NULL) {
      if (passwordData != NULL) SecKeychainItemFreeContent(NULL, passwordData);
      if (item != NULL) CFRelease(item);
      CFRelease(keychain);
      NSString *failureCode = status == errSecAuthFailed && !keychainWasUnlocked
        ? @"locked"
        : safeCode(status);
      emit(NO, failureCode, nil);
      return 1;
    }

    if ([command isEqualToString:@"resolve"]) {
      NSData *secret = [NSData dataWithBytes:passwordData length:passwordLength];
      SecKeychainItemFreeContent(NULL, passwordData);
      CFRelease(item);
      CFRelease(keychain);
      emit(YES, @"resolved", secret);
      return 0;
    }
    SecKeychainItemFreeContent(NULL, passwordData);

    if ([command isEqualToString:@"replace"]) {
      NSData *secret = decodeBase64(request[@"secretBase64"]);
      status = secret == nil
        ? errSecParam
        : SecKeychainItemModifyAttributesAndData(item, NULL, (UInt32)secret.length, secret.bytes);
      CFRelease(item);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"replaced" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }
    if ([command isEqualToString:@"delete"]) {
      status = SecKeychainItemDelete(item);
      CFRelease(item);
      CFRelease(keychain);
      emit(status == errSecSuccess, status == errSecSuccess ? @"deleted" : safeCode(status), nil);
      return status == errSecSuccess ? 0 : 1;
    }

    CFRelease(item);
    CFRelease(keychain);
    emit(NO, @"invalid_request", nil);
    return 1;
  }
}
