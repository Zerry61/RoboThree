import {
  WorkspaceSelectionError,
  type WorkspaceSelectionResolver,
} from "../../ports/workspace-selection.js";

export class FakeWorkspaceSelectionResolver implements WorkspaceSelectionResolver {
  readonly #selections = new Map<string, string>();

  register(selectionHandle: string, selectedPath: string): void {
    this.#selections.set(selectionHandle, selectedPath);
  }

  async resolve(selectionHandle: string): Promise<string> {
    const selectedPath = this.#selections.get(selectionHandle);
    if (selectedPath === undefined) {
      throw new WorkspaceSelectionError(
        "workspace.selection_not_found",
        "workspace selection handle is unknown or expired",
      );
    }
    return selectedPath;
  }
}
