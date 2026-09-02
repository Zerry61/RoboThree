import { DocumentCapabilityHandlerError } from "../runtime/index.js";
import { readSecuredDocumentBytes } from "../source/index.js";
import { ParserExecutionBoundary } from "../runtime/index.js";
import {
  isKnownDocumentCapability,
  parseStrictDocumentCapabilityOptions,
} from "./document-capability-options.js";
import { DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION } from "../protocol/index.js";
import { XLSX_WRITE_CAPABILITY_ID, writeXlsx } from "../xlsx/index.js";
import { PPTX_WRITE_CAPABILITY_ID, writePptx } from "../pptx/index.js";
import {
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_WRITE_CAPABILITY_ID,
  readTextFile,
  writeTextFile,
} from "../text/index.js";

import type {
  DocumentCapabilityHandler,
  DocumentCapabilityRequest,
  DocumentCapabilityResult,
} from "../runtime/index.js";
import type { SecuredDocumentSourceDependencies } from "../source/index.js";
import type { ParserExecutionBoundaryLike } from "../runtime/index.js";

export type DocumentCapabilityRouterOptions = Readonly<{
  source?: SecuredDocumentSourceDependencies;
  parserBoundary?: ParserExecutionBoundaryLike;
}>;

export class DocumentCapabilityRouter implements DocumentCapabilityHandler {
  readonly #source: SecuredDocumentSourceDependencies;
  readonly #parserBoundary: ParserExecutionBoundaryLike;

  public constructor(options: DocumentCapabilityRouterOptions = {}) {
    this.#source = options.source ?? {};
    this.#parserBoundary = options.parserBoundary ?? new ParserExecutionBoundary();
  }

  public async invoke(
    request: DocumentCapabilityRequest,
  ): Promise<DocumentCapabilityResult> {
    if (request.signal.aborted) {
      throw new DocumentCapabilityHandlerError(
        "cancelled",
        "Request was cancelled before processing began",
      );
    }

    const { capabilityId, limits, relativePath, workspaceRoot } = request.invoke;
    if (capabilityId === TEXT_FILE_READ_CAPABILITY_ID) {
      if (request.invoke.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
        throw new DocumentCapabilityHandlerError(
          "unsupported_feature",
          "Workspace text read is available only through the Document Worker private protocol",
          undefined,
          "private_protocol_required",
        );
      }
      return readTextFile({
        workspaceRoot,
        relativePath,
        options: request.invoke.options,
        limits,
        signal: request.signal,
      });
    }
    if (capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID) {
      if (request.invoke.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
        throw new DocumentCapabilityHandlerError(
          "unsupported_feature",
          "Workspace text write is available only through the Document Worker private protocol",
          undefined,
          "private_protocol_required",
        );
      }
      return writeTextFile({
        workspaceRoot,
        relativePath,
        options: request.invoke.options,
        limits,
        signal: request.signal,
        ...(request.invoke.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.invoke.idempotencyKey }),
        ...(request.invoke.requestDigest === undefined
          ? {}
          : { requestDigest: request.invoke.requestDigest }),
      });
    }
    if (capabilityId === XLSX_WRITE_CAPABILITY_ID) {
      if (request.invoke.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
        throw new DocumentCapabilityHandlerError(
          "unsupported_feature",
          "XLSX write is available only through the Document Worker private protocol",
        );
      }
      const xlsxWriteRequest = {
        workspaceRoot,
        relativePath,
        options: request.invoke.options,
        limits,
        signal: request.signal,
        ...(request.invoke.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.invoke.idempotencyKey }),
        ...(request.invoke.requestDigest === undefined
          ? {}
          : { requestDigest: request.invoke.requestDigest }),
      };
      return writeXlsx({
        ...xlsxWriteRequest,
      });
    }

    if (capabilityId === PPTX_WRITE_CAPABILITY_ID) {
      if (request.invoke.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
        throw new DocumentCapabilityHandlerError(
          "unsupported_feature",
          "PPTX write is available only through the Document Worker private protocol",
          undefined,
          "private_protocol_required",
        );
      }
      return writePptx({
        workspaceRoot,
        relativePath,
        options: request.invoke.options,
        limits,
        signal: request.signal,
        ...(request.invoke.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.invoke.idempotencyKey }),
        ...(request.invoke.requestDigest === undefined
          ? {}
          : { requestDigest: request.invoke.requestDigest }),
      });
    }

    if (
      capabilityId === "tool.document.pdf.extract_tables" &&
      request.invoke.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION
    ) {
      throw new DocumentCapabilityHandlerError(
        "unsupported_feature",
        "PDF table extraction is available only through the Document Worker private protocol",
        undefined,
        "private_protocol_required",
      );
    }

    if (!isKnownDocumentCapability(capabilityId)) {
      throw new DocumentCapabilityHandlerError(
        "unsupported_feature",
        `Tool ${capabilityId} is not yet implemented (DTP-1.0)`,
      );
    }

    const options = parseStrictDocumentCapabilityOptions(
      capabilityId,
      request.invoke.options,
    );
    const document = await readSecuredDocumentBytes(
      workspaceRoot,
      relativePath,
      limits.maxFileBytes,
      {
        ...this.#source,
        signal: request.signal,
      },
    );

    return this.#parserBoundary.execute({
      attemptKey: `${request.invoke.requestId}:${request.invoke.actionId}:${request.invoke.effectAttemptId}`,
      capabilityId,
      options,
      limits,
      extension: document.canonicalExtension,
      bytes: document.bytes,
      signal: request.signal,
    });
  }
}
