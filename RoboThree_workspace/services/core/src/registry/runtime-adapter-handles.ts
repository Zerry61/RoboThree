import type { ModelProvider } from "../ports/model-provider.js";
import type {
  RuntimeAdapterHandle,
  RuntimeAdapterKind,
} from "../ports/runtime-adapter-handle.js";
import type { ToolCatalogProvider } from "../ports/tool-catalog-provider.js";
import type { ToolExecutionBackend } from "../ports/tool-execution-backend.js";

export class RuntimeAdapterHandleError extends Error {
  public readonly code: "adapter.duplicate_handle" | "adapter.handle_not_found" | "adapter.handle_revision_mismatch";

  public constructor(code: RuntimeAdapterHandleError["code"], message: string) {
    super(message);
    this.name = "RuntimeAdapterHandleError";
    this.code = code;
  }
}

export class RuntimeAdapterHandles {
  readonly #handles = new Map<string, RuntimeAdapterHandle>();

  public constructor(handles: readonly RuntimeAdapterHandle[]) {
    for (const handle of handles) {
      if (this.#handles.has(handle.adapterDescriptorId)) {
        throw new RuntimeAdapterHandleError(
          "adapter.duplicate_handle",
          `adapter handle ${handle.adapterDescriptorId} is duplicated`,
        );
      }
      this.#handles.set(handle.adapterDescriptorId, handle);
    }
  }

  public modelProvider(descriptorId: string, revision: string): ModelProvider {
    return this.#require(descriptorId, revision, "model_provider") as ModelProvider;
  }

  public toolCatalogProvider(descriptorId: string, revision: string): ToolCatalogProvider {
    return this.#require(descriptorId, revision, "tool_catalog_provider") as ToolCatalogProvider;
  }

  public toolExecutionBackend(descriptorId: string, revision: string): ToolExecutionBackend {
    return this.#require(descriptorId, revision, "tool_execution_backend") as ToolExecutionBackend;
  }

  #require(descriptorId: string, revision: string, kind: RuntimeAdapterKind): RuntimeAdapterHandle {
    const handle = this.#handles.get(descriptorId);
    if (handle === undefined || handle.adapterKind !== kind) {
      throw new RuntimeAdapterHandleError(
        "adapter.handle_not_found",
        `no ${kind} handle is registered for ${descriptorId}`,
      );
    }
    if (handle.adapterDescriptorRevision !== revision) {
      throw new RuntimeAdapterHandleError(
        "adapter.handle_revision_mismatch",
        `adapter handle ${descriptorId} does not match the locked descriptor revision`,
      );
    }
    return handle;
  }
}
