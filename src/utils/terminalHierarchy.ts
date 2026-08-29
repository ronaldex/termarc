import type { TerminalTabState } from "../types/terminal";

/** Parent identity as stored on a terminal, before validating the family invariant. */
export function configuredTerminalParentId<
  T extends Pick<TerminalTabState, "id" | "launch"> & { parentTerminalId?: string },
>(tab: T): string | undefined {
  return tab.launch.kind === "subagent" ? tab.launch.parentTerminalId : tab.parentTerminalId;
}

/**
 * Resolve a valid family parent. Families are exactly one non-subagent root
 * plus direct children in the same project. Stale, cyclic, and deep links are
 * therefore treated as detached roots.
 */
export function normalizedTerminalParentId<
  T extends Pick<TerminalTabState, "id" | "projectId" | "launch"> & {
    parentTerminalId?: string;
  },
>(tabs: readonly T[], tab: T): string | undefined {
  const parentId = configuredTerminalParentId(tab);
  if (!parentId || parentId === tab.id) return undefined;
  const parent = tabs.find((candidate) => candidate.id === parentId);
  if (
    !parent ||
    parent.projectId !== tab.projectId ||
    parent.launch.kind === "subagent" ||
    configuredTerminalParentId(parent)
  ) {
    return undefined;
  }
  return parent.id;
}

export function isTerminalFamilyRoot(
  tabs: readonly TerminalTabState[],
  tab: TerminalTabState | undefined,
  projectId: string,
): tab is TerminalTabState {
  return Boolean(
    tab &&
    tab.projectId === projectId &&
    tab.launch.kind !== "subagent" &&
    !configuredTerminalParentId(tab) &&
    !normalizedTerminalParentId(tabs, tab),
  );
}
