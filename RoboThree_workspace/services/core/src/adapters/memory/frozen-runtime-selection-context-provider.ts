import type {
  RuntimeSelectionContext,
  RuntimeSelectionContextProvider,
} from "../../ports/runtime-selection-context-provider.js";

export class FrozenRuntimeSelectionContextProvider
implements RuntimeSelectionContextProvider {
  readonly #context: RuntimeSelectionContext;

  constructor(context: RuntimeSelectionContext) {
    this.#context = structuredClone(context);
    Object.freeze(this.#context);
  }

  async resolve(
    registryRevision?: string,
  ): Promise<RuntimeSelectionContext | undefined> {
    if (
      registryRevision !== undefined
      && registryRevision !== this.#context.registryRevision
    ) return undefined;
    return structuredClone(this.#context);
  }
}
