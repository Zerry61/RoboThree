#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <libkern/OSByteOrder.h>
#include <string.h>

static NSString *const ProtocolVersion = @"personal-keychain-helper.v1";
static NSString *const CredentialService = @"com.robothree.personal-model.credential.v1";
static const NSUInteger MaximumHeaderBytes = 16384;
static const NSUInteger MaximumSecretBytes = 16384;

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

static NSString *safeCodeForKeychain(OSStatus status, SecKeychainRef keychain) {
  if (status == errSecAuthFailed && keychain != NULL) {
    SecKeychainStatus flags = 0;
    if (SecKeychainGetStatus(keychain, &flags) == errSecSuccess
        && (flags & kSecUnlockStateStatus) == 0) return @"locked";
  }
  return safeCode(status);
}

static BOOL constantTimeEqual(NSData *left, NSData *right) {
  NSUInteger maximum = MAX(left.length, right.length);
  const uint8_t *leftBytes = left.bytes;
  const uint8_t *rightBytes = right.bytes;
  uint8_t difference = (uint8_t)(left.length ^ right.length);
  for (NSUInteger index = 0; index < maximum; index += 1) {
    uint8_t l = index < left.length ? leftBytes[index] : 0;
    uint8_t r = index < right.length ? rightBytes[index] : 0;
    difference |= (uint8_t)(l ^ r);
  }
  return difference == 0;
}

static BOOL isCredentialRef(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  return [(NSString *)value rangeOfString:@"^pmcr1\\.[A-Za-z0-9_-]{43,86}$"
    options:NSRegularExpressionSearch].location != NSNotFound;
}

static BOOL isDigest(id value) {
  if (![value isKindOfClass:[NSString class]]) return NO;
  return [(NSString *)value rangeOfString:@"^sha256:[0-9a-f]{64}$"
    options:NSRegularExpressionSearch].location != NSNotFound;
}

static BOOL isUuid(id value) {
  return [value isKindOfClass:[NSString class]] && [[NSUUID alloc] initWithUUIDString:value] != nil;
}

static SecKeychainRef openTestKeychain(NSDictionary *request, OSStatus *status) {
  id path = request[@"testKeychainPath"];
  if (path == nil) {
    *status = errSecSuccess;
    return NULL;
  }
  if (![path isKindOfClass:[NSString class]] || [(NSString *)path length] == 0) {
    *status = errSecParam;
    return NULL;
  }
  SecKeychainRef keychain = NULL;
  *status = SecKeychainOpen([(NSString *)path fileSystemRepresentation], &keychain);
  return keychain;
}

static NSMutableDictionary *itemQuery(NSString *credentialRef, SecKeychainRef keychain) {
  NSMutableDictionary *query = [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: CredentialService,
    (__bridge id)kSecAttrAccount: credentialRef,
  } mutableCopy];
  return query;
}

static NSDictionary *bindingMetadata(NSDictionary *request) {
  id operationId = request[@"operationId"];
  id revision = request[@"credentialRevision"];
  id digest = request[@"credentialBindingDigest"];
  if (!isUuid(operationId) || ![revision isKindOfClass:[NSNumber class]]
      || [revision integerValue] <= 0 || !isDigest(digest)) return nil;
  return @{
    @"operationId": operationId,
    @"credentialRevision": revision,
    @"credentialBindingDigest": digest,
  };
}

static NSDictionary *readBindingMetadata(id value) {
  if (![value isKindOfClass:[NSData class]]) return nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:value options:0 error:nil];
  if (![parsed isKindOfClass:[NSDictionary class]]) return nil;
  NSSet *expected = [NSSet setWithArray:@[@"operationId", @"credentialRevision", @"credentialBindingDigest"]];
  if (![[NSSet setWithArray:[parsed allKeys]] isEqualToSet:expected]) return nil;
  return bindingMetadata(parsed);
}

static OSStatus copyItem(
  NSString *credentialRef,
  SecKeychainRef keychain,
  BOOL includeSecret,
  NSDictionary **attributes,
  NSData **secret
) {
  NSMutableDictionary *query = itemQuery(credentialRef, keychain);
  if (keychain != NULL) query[(__bridge id)kSecMatchSearchList] = @[(__bridge id)keychain];
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  query[(__bridge id)kSecReturnAttributes] = @YES;
  query[(__bridge id)kSecReturnData] = @(includeSecret);
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (status != errSecSuccess || result == NULL) return status;
  NSDictionary *dictionary = CFBridgingRelease(result);
  *attributes = dictionary;
  *secret = includeSecret ? dictionary[(__bridge id)kSecValueData] : nil;
  return errSecSuccess;
}

static void writeFrame(
  BOOL ok,
  NSString *code,
  BOOL replayed,
  NSString *credentialRef,
  NSDictionary *metadata,
  NSData *secret
) {
  NSMutableDictionary *header = [@{
    @"protocolVersion": ProtocolVersion,
    @"ok": @(ok),
    @"replayed": @(replayed),
    @"code": code,
    @"secretByteLength": @(secret == nil ? 0 : secret.length),
  } mutableCopy];
  if (credentialRef != nil && metadata != nil) {
    header[@"credentialRef"] = credentialRef;
    header[@"createdByOperationId"] = metadata[@"operationId"];
    header[@"credentialRevision"] = metadata[@"credentialRevision"];
    header[@"credentialBindingDigest"] = metadata[@"credentialBindingDigest"];
  }
  NSData *headerBytes = [NSJSONSerialization dataWithJSONObject:header options:0 error:nil];
  if (headerBytes == nil || headerBytes.length == 0 || headerBytes.length > MaximumHeaderBytes) _exit(2);
  uint32_t headerLength = OSSwapHostToBigInt32((uint32_t)headerBytes.length);
  uint32_t bodyLength = OSSwapHostToBigInt32((uint32_t)(secret == nil ? 0 : secret.length));
  NSFileHandle *output = [NSFileHandle fileHandleWithStandardOutput];
  [output writeData:[NSData dataWithBytes:&headerLength length:sizeof(headerLength)]];
  [output writeData:headerBytes];
  [output writeData:[NSData dataWithBytes:&bodyLength length:sizeof(bodyLength)]];
  if (secret != nil) [output writeData:secret];
  [output synchronizeFile];
}

static void fail(NSString *code) {
  writeFrame(NO, code, NO, nil, nil, nil);
}

static BOOL validateKeys(NSDictionary *request) {
  NSSet *allowed = [NSSet setWithArray:@[
    @"protocolVersion", @"operation", @"operationId", @"credentialRef",
    @"oldCredentialRef", @"credentialRevision", @"credentialBindingDigest",
    @"testKeychainPath", @"secretByteLength",
  ]];
  for (id key in request) if (![allowed containsObject:key]) return NO;
  return YES;
}

int main(void) {
  @autoreleasepool {
    SecKeychainSetUserInteractionAllowed(false);
    NSMutableData *input = [[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile] mutableCopy];
    if (input.length < 8) { fail(@"invalid_request"); return 1; }
    const uint8_t *bytes = input.bytes;
    uint32_t headerLengthRaw = 0;
    memcpy(&headerLengthRaw, bytes, 4);
    NSUInteger headerLength = OSSwapBigToHostInt32(headerLengthRaw);
    if (headerLength == 0 || headerLength > MaximumHeaderBytes || input.length < 8 + headerLength) {
      fail(@"invalid_request"); [input resetBytesInRange:NSMakeRange(0, input.length)]; return 1;
    }
    uint32_t bodyLengthRaw = 0;
    memcpy(&bodyLengthRaw, bytes + 4 + headerLength, 4);
    NSUInteger bodyLength = OSSwapBigToHostInt32(bodyLengthRaw);
    if (bodyLength > MaximumSecretBytes || input.length != 8 + headerLength + bodyLength) {
      fail(@"invalid_request"); [input resetBytesInRange:NSMakeRange(0, input.length)]; return 1;
    }
    NSData *headerData = [NSData dataWithBytes:bytes + 4 length:headerLength];
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:headerData options:0 error:nil];
    NSData *secret = bodyLength == 0
      ? nil
      : [NSData dataWithBytes:bytes + 8 + headerLength length:bodyLength];
    if (![request isKindOfClass:[NSDictionary class]] || !validateKeys(request)
        || ![request[@"protocolVersion"] isEqual:ProtocolVersion]
        || !isCredentialRef(request[@"credentialRef"])
        || ![request[@"secretByteLength"] isKindOfClass:[NSNumber class]]
        || [request[@"secretByteLength"] unsignedIntegerValue] != bodyLength) {
      fail(@"invalid_request"); [input resetBytesInRange:NSMakeRange(0, input.length)]; return 1;
    }
    NSString *operation = request[@"operation"];
    if (![operation isKindOfClass:[NSString class]]) {
      fail(@"invalid_request"); [input resetBytesInRange:NSMakeRange(0, input.length)]; return 1;
    }
    OSStatus keychainStatus = errSecSuccess;
    SecKeychainRef keychain = openTestKeychain(request, &keychainStatus);
    if (keychainStatus != errSecSuccess) {
      fail(safeCode(keychainStatus)); [input resetBytesInRange:NSMakeRange(0, input.length)]; return 1;
    }
    NSString *credentialRef = request[@"credentialRef"];
    NSDictionary *existingAttributes = nil;
    NSData *existingSecret = nil;
    OSStatus status = errSecSuccess;

    if ([operation isEqualToString:@"inspect"] || [operation isEqualToString:@"resolve"]) {
      BOOL resolve = [operation isEqualToString:@"resolve"];
      status = copyItem(credentialRef, keychain, resolve, &existingAttributes, &existingSecret);
      if (status != errSecSuccess) fail(safeCodeForKeychain(status, keychain));
      else {
        NSDictionary *metadata = readBindingMetadata(existingAttributes[(__bridge id)kSecAttrGeneric]);
        if (metadata == nil || (resolve && existingSecret == nil)) fail(@"corrupted");
        else writeFrame(YES, @"ok", NO, credentialRef, metadata, resolve ? existingSecret : nil);
      }
    } else if ([operation isEqualToString:@"store"] || [operation isEqualToString:@"replace"]) {
      NSDictionary *metadata = bindingMetadata(request);
      if (metadata == nil || secret == nil || secret.length == 0) {
        fail(@"invalid_request");
      } else {
        if ([operation isEqualToString:@"replace"]) {
          if (!isCredentialRef(request[@"oldCredentialRef"])) status = errSecParam;
          else status = copyItem(request[@"oldCredentialRef"], keychain, NO, &existingAttributes, &existingSecret);
          if (status != errSecSuccess) {
            fail(safeCodeForKeychain(status, keychain));
            if (keychain != NULL) CFRelease(keychain);
            [input resetBytesInRange:NSMakeRange(0, input.length)];
            return 1;
          }
        }
        status = copyItem(credentialRef, keychain, YES, &existingAttributes, &existingSecret);
        if (status == errSecSuccess) {
          NSDictionary *existingMetadata = readBindingMetadata(existingAttributes[(__bridge id)kSecAttrGeneric]);
          NSData *newMetadata = [NSJSONSerialization dataWithJSONObject:metadata options:NSJSONWritingSortedKeys error:nil];
          NSData *oldMetadata = existingMetadata == nil ? nil
            : [NSJSONSerialization dataWithJSONObject:existingMetadata options:NSJSONWritingSortedKeys error:nil];
          if (oldMetadata != nil && constantTimeEqual(oldMetadata, newMetadata)
              && constantTimeEqual(existingSecret, secret)) {
            writeFrame(YES, @"ok", YES, credentialRef, metadata, nil);
          } else fail(@"input_already_bound");
        } else if (status == errSecItemNotFound) {
          NSData *metadataData = [NSJSONSerialization dataWithJSONObject:metadata options:0 error:nil];
          NSMutableDictionary *add = itemQuery(credentialRef, keychain);
          if (keychain != NULL) add[(__bridge id)kSecUseKeychain] = (__bridge id)keychain;
          add[(__bridge id)kSecValueData] = secret;
          add[(__bridge id)kSecAttrGeneric] = metadataData;
          add[(__bridge id)kSecAttrSynchronizable] = @NO;
          add[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
          status = SecItemAdd((__bridge CFDictionaryRef)add, NULL);
          if (status == errSecSuccess) writeFrame(YES, @"ok", NO, credentialRef, metadata, nil);
          else fail(safeCodeForKeychain(status, keychain));
        } else fail(safeCodeForKeychain(status, keychain));
      }
    } else if ([operation isEqualToString:@"delete"]) {
      if (!isUuid(request[@"operationId"]) || bodyLength != 0) fail(@"invalid_request");
      else {
        NSMutableDictionary *deleteQuery = itemQuery(credentialRef, keychain);
        if (keychain != NULL) {
          deleteQuery[(__bridge id)kSecMatchSearchList] = @[(__bridge id)keychain];
        }
        status = SecItemDelete((__bridge CFDictionaryRef)deleteQuery);
        if (status == errSecSuccess) writeFrame(YES, @"ok", NO, nil, nil, nil);
        else fail(safeCodeForKeychain(status, keychain));
      }
    } else fail(@"invalid_request");

    if (keychain != NULL) CFRelease(keychain);
    [input resetBytesInRange:NSMakeRange(0, input.length)];
    return status == errSecSuccess ? 0 : 1;
  }
}
