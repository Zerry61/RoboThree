import type { RawWorkspaceEntry } from "../ports/workspace-browser.js";

const deniedNames = new Set([
  ".DS_Store",
  ".git",
  ".hg",
  ".pnpm",
  ".svn",
  "node_modules",
]);

const kindOrder: Record<RawWorkspaceEntry["kind"], number> = {
  directory: 0,
  file: 1,
  symlink: 2,
};

export class WorkspaceEntryVisibilityPolicy {
  filterAndSort(entries: readonly RawWorkspaceEntry[]): readonly RawWorkspaceEntry[] {
    return entries
      .filter((entry) => !deniedNames.has(entry.displayName))
      .toSorted((left, right) => {
        const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
        if (kindDifference !== 0) return kindDifference;
        const leftKey = left.displayName.normalize("NFC").toLocaleLowerCase("en-US");
        const rightKey = right.displayName.normalize("NFC").toLocaleLowerCase("en-US");
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1
          : left.displayName < right.displayName ? -1
            : left.displayName > right.displayName ? 1 : 0;
      });
  }
}
