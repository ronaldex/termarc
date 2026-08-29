import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";

const STORAGE_KEY = "termarc-workspace-state";
const STORAGE_VERSION = 1;

type PersistedWorkspaceState = {
  version: typeof STORAGE_VERSION;
  selection: SidebarSelection;
};

type RestorableTab = Pick<TerminalTab, "id" | "projectId">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isSidebarSelection(value: unknown): value is SidebarSelection {
  if (!isRecord(value) || !isString(value.id) || !isString(value.kind)) return false;

  switch (value.kind) {
    case "projects":
      return value.projectId === undefined || isString(value.projectId);
    case "app-settings":
    case "keyboard-shortcuts":
      return true;
    case "project":
    case "terminals":
    case "add-terminal":
    case "commands":
    case "add-command":
    case "agents":
    case "add-agent":
      return isString(value.projectId);
    case "terminal":
      return isString(value.projectId) && isString(value.tabId);
    case "subagent":
      return isString(value.projectId) && isString(value.tabId) && isString(value.parentTerminalId);
    case "command":
    case "edit-command":
    case "agent":
    case "edit-agent":
      return isString(value.projectId) && isString(value.commandId);
    default:
      return false;
  }
}

export function loadWorkspaceSelection(): SidebarSelection | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as unknown;
    if (
      !isRecord(state) ||
      state.version !== STORAGE_VERSION ||
      !isSidebarSelection(state.selection)
    )
      return;
    return state.selection;
  } catch (error) {
    console.error("Could not load workspace state", error);
    return;
  }
}

export function saveWorkspaceSelection(selection: SidebarSelection): void {
  try {
    // Runtime-only children cannot be restored after restart. Keep the last
    // stable selection rather than replacing or erasing it while inspecting one.
    if (selection.kind === "subagent") return;
    const state: PersistedWorkspaceState = { version: STORAGE_VERSION, selection };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save workspace state", error);
  }
}

export function resolveWorkspaceSelection(
  selection: SidebarSelection | undefined,
  projects: readonly Project[],
  tabs: readonly RestorableTab[],
): SidebarSelection | undefined {
  if (!selection) return;
  if (selection.kind === "app-settings" || selection.kind === "projects") return selection;
  // Modal and runtime-only selections are never restored across app launches.
  if (selection.kind === "keyboard-shortcuts" || selection.kind === "subagent") return;

  const project = projects.find((item) => item.id === selection.projectId);
  if (!project) return;

  if (selection.kind === "terminal") {
    return tabs.some((tab) => tab.id === selection.tabId && tab.projectId === selection.projectId)
      ? selection
      : undefined;
  }
  if (selection.kind === "command" || selection.kind === "edit-command") {
    return project.commands?.some((command) => command.id === selection.commandId)
      ? selection
      : undefined;
  }
  if (selection.kind === "agent" || selection.kind === "edit-agent") {
    return project.agents?.some((agent) => agent.id === selection.commandId)
      ? selection
      : undefined;
  }
  return selection;
}
