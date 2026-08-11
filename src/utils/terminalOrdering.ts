import type { ProjectTerminal } from "../types/project";
import type { TerminalTabState } from "../types/terminal";

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
  T extends Pick<TerminalTabState, "id" | "projectId" | "launch">,
>(
  tabs: readonly T[],
  projectId: string,
  movedId: string,
  targetId: string,
  placement: DropPlacement,
): T[] {
  const belongs = (tab: T) => tab.projectId === projectId && tab.launch.kind === "shell";
  const subset = tabs.filter(belongs);
  const ids = moveId(
    subset.map((tab) => tab.id),
    movedId,
    targetId,
    placement,
  );
  const byId = new Map(subset.map((tab) => [tab.id, tab]));
  if (byId.size !== ids.length) return [...tabs];
  let index = 0;
  return tabs.map((tab) => {
    if (!belongs(tab)) return tab;
    const id = ids[index++];
    return id ? (byId.get(id) ?? tab) : tab;
  });
}
