import type {
  DocumentWorkerErrorCode,
  DocumentWorkerInvokeMessage,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";

export type DocumentCapabilityRequest = Readonly<{
  invoke: DocumentWorkerInvokeMessage;
  signal: AbortSignal;
}>;

export type DocumentCapabilityResult = Readonly<{
  output: unknown;
  metadata: DocumentWorkerResultMetadata;
}>;

export interface DocumentCapabilityHandler {
  invoke(request: DocumentCapabilityRequest): Promise<DocumentCapabilityResult>;
}

export class DocumentCapabilityHandlerError extends Error {
  public readonly code: DocumentWorkerErrorCode;
  public readonly digest: string | undefined;
  public readonly detailCode: string | undefined;

  public constructor(
    code: DocumentWorkerErrorCode,
    message: string,
    digest?: string,
    detailCode?: string,
  ) {
    super(message);
    this.name = "DocumentCapabilityHandlerError";
    this.code = code;
    this.digest = digest;
    this.detailCode = detailCode;
  }
}

export class UnsupportedDocumentCapabilityHandler implements DocumentCapabilityHandler {
  public async invoke(
    request: DocumentCapabilityRequest,
  ): Promise<DocumentCapabilityResult> {
    if (request.signal.aborted) {
      throw new DocumentCapabilityHandlerError(
        "cancelled",
        "Request was cancelled before processing began",
      );
    }

    throw new DocumentCapabilityHandlerError(
      "unsupported_feature",
      `Tool ${request.invoke.capabilityId} is not yet implemented (DTP-1)`,
    );
  }
}
