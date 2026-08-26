import type {
  RuntimeSelectionContext,
  RuntimeSelectionContextProvider,
} from "../../ports/runtime-selection-context-provider.js";

export class FakeRuntimeSelectionContextProvider
implements RuntimeSelectionContextProvider {
  readonly #contexts = new Map<string, RuntimeSelectionContext>();
  #currentRevision: string | undefined;

  constructor(contexts: readonly RuntimeSelectionContext[] = []) {
    for (const context of contexts) this.register(context);
  }

  register(context: RuntimeSelectionContext, makeCurrent = true): void {
    this.#contexts.set(context.registryRevision, structuredClone(context));
    if (makeCurrent) this.#currentRevision = context.registryRevision;
  }

  remove(registryRevision: string): void {
    this.#contexts.delete(registryRevision);
    if (this.#currentRevision === registryRevision) {
      this.#currentRevision = undefined;
    }
  }

  async resolve(
    registryRevision?: string,
  ): Promise<RuntimeSelectionContext | undefined> {
    const resolvedRevision = registryRevision ?? this.#currentRevision;
    const context = resolvedRevision === undefined
      ? undefined
      : this.#contexts.get(resolvedRevision);
    return context === undefined ? undefined : structuredClone(context);
  }
}
