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

/**
 * Reorders one project's shell tree without moving command runs or other projects.
 * Dropping a child beside a root promotes it; dropping it beside another child
 * keeps it under that child's parent.
 */
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
  const moved = shellById.get(movedId);
  const target = shellById.get(targetId);
  if (!moved || !target || moved === target) return [...tabs];

  const parentOf = (tab: T): string | undefined => normalizedTerminalParentId(tabs, tab);
  const movedParent = parentOf(moved);
  const targetParent = parentOf(target);
  let orderedIds: string[];

  if (movedParent && targetParent) {
    const destinationChildren = subset
      .filter((tab) => parentOf(tab) === targetParent)
      .map((tab) => tab.id);
    const movedWithoutParent =
      movedParent === targetParent ? moved : { ...moved, parentTerminalId: targetParent };
    shellById.set(movedId, movedWithoutParent as T);
    const childIds = moveId(
      destinationChildren.includes(movedId)
        ? destinationChildren
        : [...destinationChildren, movedId],
      movedId,
      targetId,
      placement,
    );
    orderedIds = treeOrder(subset, shellById, parentOf, movedId, targetParent, childIds);
  } else {
    if (movedParent) shellById.set(movedId, { ...moved, parentTerminalId: undefined } as T);
    const rootIds = subset
      .filter((tab) => !parentOf(tab) || tab.id === movedId)
      .map((tab) => tab.id);
    const targetRootId = targetParent ?? target.id;
    orderedIds = moveId(rootIds, movedId, targetRootId, placement).flatMap((rootId) => [
      rootId,
      ...subset
        .filter((tab) => tab.id !== movedId && parentOf(tab) === rootId)
        .map((tab) => tab.id),
    ]);
  }

  if (shellById.size !== orderedIds.length) return [...tabs];
  let index = 0;
  return tabs.map((tab) => {
    if (!belongs(tab)) return tab;
    const id = orderedIds[index++];
    return id ? (shellById.get(id) ?? tab) : tab;
  });
}

function treeOrder<T extends { id: string }>(
  subset: readonly T[],
  byId: ReadonlyMap<string, T>,
  originalParentOf: (tab: T) => string | undefined,
  movedId: string,
  destinationParentId: string,
  destinationChildren: readonly string[],
): string[] {
  const parentOf = (tab: T) => (tab.id === movedId ? destinationParentId : originalParentOf(tab));
  return subset
    .filter((tab) => !parentOf(tab))
    .flatMap((root) => [
      root.id,
      ...(root.id === destinationParentId
        ? destinationChildren
        : subset.filter((tab) => parentOf(tab) === root.id).map((tab) => tab.id)),
    ])
    .filter((id) => byId.has(id));
}
