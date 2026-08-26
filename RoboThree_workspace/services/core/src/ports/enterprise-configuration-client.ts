import type { EnterprisePackageReference } from "@robothree/contracts";

import type { EnterpriseIdentityScope } from "./enterprise-access-token-provider.js";

export type EnterpriseConfigurationDocumentResult =
  | Readonly<{
    status: "modified";
    rawJson: string;
    etag: string;
    byteLength: number;
  }>
  | Readonly<{
    status: "not_modified";
    etag: string;
  }>;

export type EnterpriseConfigurationPackageReadRequest = Readonly<{
  snapshotId: string;
  snapshotRevision: string;
  snapshotDigest: string;
  reference: EnterprisePackageReference;
  ifNoneMatch?: string;
  signal?: AbortSignal;
}>;

export interface EnterpriseConfigurationReadOperation {
  readonly scope: EnterpriseIdentityScope;
  readSnapshot(input?: Readonly<{
    ifNoneMatch?: string;
    signal?: AbortSignal;
  }>): Promise<EnterpriseConfigurationDocumentResult>;
  readPackage(
    input: EnterpriseConfigurationPackageReadRequest,
  ): Promise<EnterpriseConfigurationDocumentResult>;
  assertReadyToSeal(): Promise<void>;
}

export interface EnterpriseConfigurationClient {
  beginRead(
    scope: EnterpriseIdentityScope,
  ): EnterpriseConfigurationReadOperation;
}

export type EnterpriseConfigurationClientErrorCode =
  | "configuration.client_offline"
  | "configuration.client_timeout"
  | "configuration.client_cancelled"
  | "configuration.client_redirect_rejected"
  | "configuration.client_response_too_large"
  | "configuration.client_protocol_invalid"
  | "configuration.client_unauthorized"
  | "configuration.client_http_error";

export class EnterpriseConfigurationClientError extends Error {
  readonly code: EnterpriseConfigurationClientErrorCode;

  constructor(code: EnterpriseConfigurationClientErrorCode, message: string) {
    super(message);
    this.name = "EnterpriseConfigurationClientError";
    this.code = code;
  }
}

