import type { ProjectCommand, ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { normalizedTerminalFamilyModel } from "./terminalFamily";
import { terminalMatchesFilter } from "./terminalLabels";

/** Canonical terminal-like row consumed by rendering, focus, filtering, and shortcuts. */
export type ProjectTreeTerminalItem = {
  id: string;
  tab: TerminalTabState;
  selection: Extract<SidebarSelection, { kind: "terminal" | "subagent" }>;
  parentId?: string;
  children: ProjectTreeTerminalItem[];
  active: boolean;
};

export type ProjectTreeCount = { active: number; total: number };

export type ProjectTreeCommandItem = {
  command: ProjectCommand;
  tab?: TerminalTabState;
};

export type ProjectTreeAgentItem = ProjectTreeCommandItem & {
  terminalItems: ProjectTreeTerminalItem[];
};

export type ProjectTreeRuntimeAgentParent = {
  tab: TerminalTabState;
  terminalItems: ProjectTreeTerminalItem[];
};

export type ProjectTreeDisplayProject = ProjectTreeProject & {
  /** Filtered root shell rows. Children live exclusively on these canonical nodes. */
  terminalItems: ProjectTreeTerminalItem[];
  /** All visible terminal-like nodes in rendered/focus order. */
  terminalNodes: ProjectTreeTerminalItem[];
  hasTerminals: boolean;
  commandItems: ProjectTreeCommandItem[];
  agentItems: ProjectTreeAgentItem[];
  runtimeAgentParents: ProjectTreeRuntimeAgentParent[];
  detachedAgentItems: ProjectTreeTerminalItem[];
  counts: {
    terminals: ProjectTreeCount;
    agents: ProjectTreeCount;
    commands: ProjectTreeCount;
  };
};

export function terminalTreeSelection(
  tab: TerminalTabState,
): Extract<SidebarSelection, { kind: "terminal" | "subagent" }> {
  if (tab.launch.kind === "subagent") {
    return {
      id: tab.id,
      kind: "subagent",
      projectId: tab.projectId,
      tabId: tab.id,
      parentTerminalId: tab.launch.parentTerminalId,
    };
  }
  return { id: tab.id, kind: "terminal", projectId: tab.projectId, tabId: tab.id };
}

export function projectTreeModel(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  filter = "",
): ProjectTreeDisplayProject[] {
  const query = filter.trim().toLowerCase();
  const familyModel = normalizedTerminalFamilyModel(tabs);
  const parentByTabId = new Map(familyModel.nodes.map((node) => [node.id, node.parentTerminalId]));
  const shellRootsByProject = new Map<string, TerminalTabState[]>();
  const childrenByParent = new Map<string, TerminalTabState[]>();
  const commandTabsByKey = new Map<string, TerminalTabState>();
  const detachedSubagentsByProject = new Map<string, TerminalTabState[]>();

  for (const tab of tabs) {
    const parentId = parentByTabId.get(tab.id);
    if (tab.launch.kind === "command") {
      commandTabsByKey.set(
        commandKey(tab.projectId, tab.launch.commandId, tab.launch.source ?? "command"),
        tab,
      );
    } else if (parentId) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(tab);
      childrenByParent.set(parentId, children);
    } else if (tab.launch.kind === "subagent") {
      const detached = detachedSubagentsByProject.get(tab.projectId) ?? [];
      detached.push(tab);
      detachedSubagentsByProject.set(tab.projectId, detached);
    } else {
      const roots = shellRootsByProject.get(tab.projectId) ?? [];
      roots.push(tab);
      shellRootsByProject.set(tab.projectId, roots);
    }
  }

  const makeItem = (
    tab: TerminalTabState,
    children: ProjectTreeTerminalItem[] = [],
    parentId?: string,
  ): ProjectTreeTerminalItem => ({
    id: tab.id,
    tab,
    selection: terminalTreeSelection(tab),
    parentId,
    children,
    active: isActive(tab),
  });
  const visibleChildren = (
    parent: TerminalTabState,
    ancestorMatches = false,
    include: (tab: TerminalTabState) => boolean = () => true,
  ): ProjectTreeTerminalItem[] => {
    const parentMatches = ancestorMatches || terminalMatchesFilter(parent, filter);
    return (childrenByParent.get(parent.id) ?? [])
      .filter(include)
      .filter((child) => !query || parentMatches || terminalMatchesFilter(child, filter))
      .map((child) => makeItem(child, [], parent.id));
  };
  const visibleRoot = (root: TerminalTabState): ProjectTreeTerminalItem | undefined => {
    const children = visibleChildren(root, false, (child) => child.launch.kind === "shell");
    if (query && !terminalMatchesFilter(root, filter) && !children.length) return undefined;
    return makeItem(root, children);
  };

  return projects.map((project) => {
    const roots = shellRootsByProject.get(project.id) ?? [];
    const terminalItems = roots.flatMap((root) => {
      const item = visibleRoot(root);
      return item ? [item] : [];
    });
    const commandMatches = (command: ProjectCommand) =>
      !query || `${command.name} ${command.command}`.toLowerCase().includes(query);
    const allAgentItems = (project.agents ?? []).map((agent): ProjectTreeAgentItem => {
      const tab = commandTabsByKey.get(commandKey(project.id, agent.id, "agent"));
      const children = tab ? visibleChildren(tab, commandMatches(agent)) : [];
      return {
        command: agent,
        tab,
        // Keep runtime agent children ahead of shell subterminals, matching the
        // established project-tree shortcut order while sharing one row list.
        terminalItems: [
          ...children.filter((item) => item.tab.launch.kind === "subagent"),
          ...children.filter((item) => item.tab.launch.kind !== "subagent"),
        ],
      };
    });
    const representedParentIds = new Set(
      allAgentItems.flatMap((item) => (item.tab ? [item.tab.id] : [])),
    );
    const agentItems = allAgentItems.filter(
      (item) =>
        !query ||
        commandMatches(item.command) ||
        (item.tab ? terminalMatchesFilter(item.tab, filter) : false) ||
        item.terminalItems.length > 0,
    );
    const runtimeAgentParents = tabs
      .filter(
        (tab) =>
          tab.projectId === project.id &&
          tab.launch.kind !== "subagent" &&
          !representedParentIds.has(tab.id) &&
          (childrenByParent.get(tab.id) ?? []).some((child) => child.launch.kind === "subagent"),
      )
      .flatMap((tab): ProjectTreeRuntimeAgentParent[] => {
        const terminalItems = visibleChildren(tab).filter(
          (item) => item.tab.launch.kind === "subagent",
        );
        if (query && !terminalMatchesFilter(tab, filter) && !terminalItems.length) return [];
        return [{ tab, terminalItems }];
      });
    const detachedAgentItems = (detachedSubagentsByProject.get(project.id) ?? [])
      .filter((tab) => terminalMatchesFilter(tab, filter))
      .map((tab) => makeItem(tab));
    const terminalGroupNodes = terminalItems.flatMap(flattenTerminalItem);
    const agentTerminalNodes = [
      ...agentItems.flatMap((item) => item.terminalItems),
      ...runtimeAgentParents.flatMap((item) => item.terminalItems),
      ...detachedAgentItems,
    ];
    const terminalNodes = [...agentTerminalNodes, ...terminalGroupNodes];
    const commandItems = (project.commands ?? [])
      .map((command) => ({
        command,
        tab: commandTabsByKey.get(commandKey(project.id, command.id, "command")),
      }))
      .filter(
        (item) =>
          commandMatches(item.command) ||
          (item.tab ? terminalMatchesFilter(item.tab, filter) : false),
      );

    return {
      ...project,
      terminalItems,
      terminalNodes,
      hasTerminals: roots.length > 0,
      commandItems,
      agentItems,
      runtimeAgentParents,
      detachedAgentItems,
      counts: {
        terminals: countItems(terminalGroupNodes),
        agents: {
          active:
            agentItems.filter((item) => isActive(item.tab)).length +
            agentTerminalNodes.filter((item) => item.active).length,
          total: agentItems.length + agentTerminalNodes.length,
        },
        commands: {
          active: commandItems.filter((item) => isActive(item.tab)).length,
          total: commandItems.length,
        },
      },
    };
  });
}

export function flattenProjectTreeModel(
  projects: readonly ProjectTreeDisplayProject[],
): SidebarSelection[] {
  return projects.flatMap((project) => {
    const nodes: SidebarSelection[] = [projectSelection(project.id)];
    if (!project.projectOpen) return nodes;

    if (project.counts.agents.total) {
      nodes.push({ id: `${project.id}:agents`, kind: "agents", projectId: project.id });
    }
    if (project.agentsOpen) {
      for (const item of project.agentItems) {
        nodes.push({
          id: `${project.id}:agent:${item.command.id}`,
          kind: "agent",
          projectId: project.id,
          commandId: item.command.id,
        });
        nodes.push(...item.terminalItems.flatMap(flattenTerminalSelection));
      }
      for (const parent of project.runtimeAgentParents) {
        nodes.push(...parent.terminalItems.flatMap(flattenTerminalSelection));
      }
      nodes.push(...project.detachedAgentItems.flatMap(flattenTerminalSelection));
    }

    nodes.push({ id: `${project.id}:terminals`, kind: "terminals", projectId: project.id });
    if (project.terminalOpen) {
      nodes.push(...project.terminalItems.flatMap(flattenTerminalSelection));
      if (!project.hasTerminals) {
        nodes.push({
          id: `${project.id}:add-terminal`,
          kind: "add-terminal",
          projectId: project.id,
        });
      }
    }

    if (project.commandItems.length) {
      nodes.push({ id: `${project.id}:commands`, kind: "commands", projectId: project.id });
    }
    if (project.commandsOpen) {
      nodes.push(
        ...project.commandItems.map(({ command }) => ({
          id: `${project.id}:command:${command.id}`,
          kind: "command" as const,
          projectId: project.id,
          commandId: command.id,
        })),
      );
    }
    return nodes;
  });
}

function flattenTerminalItem(item: ProjectTreeTerminalItem): ProjectTreeTerminalItem[] {
  return [item, ...item.children.flatMap(flattenTerminalItem)];
}

function flattenTerminalSelection(item: ProjectTreeTerminalItem): SidebarSelection[] {
  return [item.selection, ...item.children.flatMap(flattenTerminalSelection)];
}

function countItems(items: readonly ProjectTreeTerminalItem[]): ProjectTreeCount {
  return { active: items.filter((item) => item.active).length, total: items.length };
}

function isActive(tab: TerminalTabState | undefined): boolean {
  return tab?.status === "starting" || tab?.status === "running";
}

function commandKey(projectId: string, commandId: string, source: "command" | "agent"): string {
  return `${projectId}\0${source}\0${commandId}`;
}

function projectSelection(projectId: string): SidebarSelection {
  return { id: projectId, kind: "project", projectId };
}
