import type { TerminalTabState } from "../types/terminal";
import { configuredTerminalParentId, normalizedTerminalParentId } from "./terminalHierarchy";

export type TerminalFamily = {
  rootTabId: string;
  memberTabIds: string[];
};

export type NormalizedTerminalFamilyNode = {
  id: string;
  tab: TerminalTabState;
  rootTabId: string;
  parentTerminalId?: string;
};

export type NormalizedTerminalFamilyModel = {
  nodes: NormalizedTerminalFamilyNode[];
  families: TerminalFamily[];
};

export const terminalParentId = configuredTerminalParentId;

/** Canonical one-root/direct-child family normalization shared by all presentation models. */
export function normalizedTerminalFamilyModel(
  tabs: readonly TerminalTabState[],
): NormalizedTerminalFamilyModel {
  const nodes = tabs.map((tab): NormalizedTerminalFamilyNode => {
    const parentTerminalId = normalizedTerminalParentId(tabs, tab);
    return {
      id: tab.id,
      tab,
      parentTerminalId,
      rootTabId: parentTerminalId ?? tab.id,
    };
  });
  const families = nodes
    .filter((node) => node.rootTabId === node.id)
    .map((root) => ({
      rootTabId: root.id,
      memberTabIds: [
        root.id,
        ...nodes
          .filter((node) => node.id !== root.id && node.rootTabId === root.id)
          .map((node) => node.id),
      ],
    }));
  return { nodes, families };
}

/** Resolve a root and its direct children. Orphans become independent roots. */
export function terminalFamilyForTab(
  tabs: readonly TerminalTabState[],
  tabId: string | undefined,
): TerminalFamily | undefined {
  const model = normalizedTerminalFamilyModel(tabs);
  const node = model.nodes.find((candidate) => candidate.id === tabId);
  return node ? model.families.find((family) => family.rootTabId === node.rootTabId) : undefined;
}

export function sidebarTerminalIds(
  family: TerminalFamily | undefined,
  mainTerminalId: string | undefined,
): string[] {
  if (!family) return [];
  return family.memberTabIds.filter((id) => id !== mainTerminalId);
}
