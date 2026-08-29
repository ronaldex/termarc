import type { TerminalTabState } from "../types/terminal";
import { normalizedTerminalParentId } from "./terminalHierarchy";

export type DropPlacement = "before" | "after";

export function moveId(
  ids: readonly string[],
  movedId: string,
  targetId: string,
  placement: DropPlacement,
): string[] {
  if (
    movedId === targetId ||
    new Set(ids).size !== ids.length ||
    !ids.includes(movedId) ||
    !ids.includes(targetId)
  )
    return [...ids];
  const result = ids.filter((id) => id !== movedId);
  const targetIndex = result.indexOf(targetId);
  result.splice(targetIndex + (placement === "after" ? 1 : 0), 0, movedId);
  return result;
}

/** Reorders one project's shell tabs without moving command runs or other projects. */
export function reorderProjectTerminalTabs<
  T extends Pick<TerminalTabState, "id" | "projectId" | "launch"> & {
    parentTerminalId?: string;
  },
>(
  tabs: readonly T[],
  projectId: string,
  movedId: string,
  targetId: string,
  placement: DropPlacement,
): T[] {
  const belongs = (tab: T) => tab.projectId === projectId && tab.launch.kind === "shell";
  const subset = tabs.filter(belongs);
  const shellById = new Map(subset.map((tab) => [tab.id, tab]));
  // Keep ordering in lockstep with the normalized tree: stale, cyclic, and
  // deep links are detached roots rather than implicit family members.
  const familyRootId = (tab: T): string => normalizedTerminalParentId(tabs, tab) ?? tab.id;
  const familyIds = [...new Set(subset.map(familyRootId))];
  const moved = shellById.get(movedId);
  const target = shellById.get(targetId);
  const orderedFamilyIds = moveId(
    familyIds,
    moved ? familyRootId(moved) : movedId,
    target ? familyRootId(target) : targetId,
    placement,
  );
  const ids = orderedFamilyIds.flatMap((rootId) =>
    subset
      .filter((tab) => familyRootId(tab) === rootId)
      .sort((left, right) => Number(right.id === rootId) - Number(left.id === rootId))
      .map((tab) => tab.id),
  );
  if (shellById.size !== ids.length) return [...tabs];
  let index = 0;
  return tabs.map((tab) => {
    if (!belongs(tab)) return tab;
    const id = ids[index++];
    return id ? (shellById.get(id) ?? tab) : tab;
  });
}
