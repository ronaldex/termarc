import { listen } from "@tauri-apps/api/event";
import type { Ref } from "vue";
import {
  acknowledgeWorkspaceControl,
  registerWorkspace,
  type WorkspaceAction,
  type WorkspaceControlEvent,
} from "../api/workspaceControl";
import type { Project } from "../types/project";
import type { TerminalTab } from "../types/terminal";

export type WorkspaceControlDependencies = {
  projects: Ref<Project[]>;
  tabs: TerminalTab[];
  createTerminal: (projectId: string, cwd: string, parentTerminalId?: string) => Promise<TerminalTab | undefined>;
  startTerminal: (tab: TerminalTab) => Promise<void>;
  stopTerminal: (tab: TerminalTab) => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  sendTerminalText: (id: string, text: string) => void;
  runCommand: (projectId: string, id: string, source: "command" | "agent") => Promise<void>;
  stopCommand: (projectId: string, id: string, source: "command" | "agent") => Promise<void>;
};

function error(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function tabStatus(tab: TerminalTab) {
  return { id: tab.id, projectId: tab.projectId, parentTerminalId: tab.parentTerminalId, name: tab.customTitle || tab.launchTitle || tab.title, cwd: tab.currentCwd, status: tab.status, launch: tab.launch };
}

/** Bridges CLI requests to the owning renderer; no filesystem or PTY policy lives here. */
export function createWorkspaceControlService(dependencies: WorkspaceControlDependencies) {
  async function dispatch(action: WorkspaceAction): Promise<unknown> {
    const project = action.projectId
      ? dependencies.projects.value.find((item) => item.id === action.projectId)
      : undefined;
    const tab = action.id ? dependencies.tabs.find((item) => item.id === action.id) : undefined;
    const terminalResource = action.resource === "terminals" || action.resource === "subterminals";

    if (action.action === "list") {
      if (terminalResource) return dependencies.tabs
        .filter((item) => (!action.projectId || item.projectId === action.projectId) && (!action.parentTerminalId || item.parentTerminalId === action.parentTerminalId))
        .filter((item) => action.resource === "terminals" ? !item.parentTerminalId : Boolean(item.parentTerminalId))
        .map(tabStatus);
      if (!project) error("project_required", `${action.resource} list requires --project`);
      const items = action.resource === "agents" ? project.agents ?? [] : project.commands ?? [];
      return items.map((item) => ({ ...item, running: dependencies.tabs.some((tab) => tab.projectId === project.id && tab.launch.kind === "command" && tab.launch.commandId === item.id && (tab.launch.source ?? "command") === (action.resource === "agents" ? "agent" : "command")) }));
    }
    if (action.action === "create") {
      const parent = action.parentTerminalId ? dependencies.tabs.find((item) => item.id === action.parentTerminalId) : undefined;
      const targetProject = project ?? (parent ? dependencies.projects.value.find((item) => item.id === parent.projectId) : undefined);
      if (!targetProject) error("project_not_found", "project was not found");
      if (action.resource === "subterminals" && !parent) error("terminal_not_found", "parent terminal was not found");
      const created = await dependencies.createTerminal(targetProject.id, action.cwd || parent?.currentCwd || targetProject.directory, parent?.id);
      if (!created) error("create_failed", "could not create terminal");
      if (action.name) created.customTitle = action.name;
      return tabStatus(created);
    }
    if (action.resource === "commands" || action.resource === "agents") {
      if (!project) error("project_required", `${action.resource} operations require --project`);
      const source = action.resource === "agents" ? "agent" : "command";
      const item = (source === "agent" ? project.agents : project.commands)?.find((entry) => entry.id === action.id);
      if (!item) error("not_found", `${source} was not found: ${action.id}`);
      if (action.action === "run") { await dependencies.runCommand(project.id, item.id, source); return { id: item.id, running: true }; }
      if (action.action === "stop" || action.action === "close") { await dependencies.stopCommand(project.id, item.id, source); return {}; }
      if (action.action === "status" || action.action === "wait") return { ...item, running: dependencies.tabs.some((candidate) => candidate.projectId === project.id && candidate.launch.kind === "command" && candidate.launch.commandId === item.id && (candidate.launch.source ?? "command") === source) };
      error("unsupported_operation", `${action.action} is not supported for ${action.resource}`);
    }
    if (!tab) error("terminal_not_found", `terminal was not found: ${action.id}`);
    if (action.action === "status" || action.action === "wait") return tabStatus(tab);
    if (action.action === "send") { if (!action.text) error("invalid_request", "send requires --text"); dependencies.sendTerminalText(tab.id, action.text); return {}; }
    if (action.action === "stop") { await dependencies.stopTerminal(tab); return {}; }
    if (action.action === "close") { await dependencies.closeTerminal(tab.id); return {}; }
    if (action.action === "run") { await dependencies.startTerminal(tab); return tabStatus(tab); }
    error("unsupported_operation", `${action.action} is not supported for terminals`);
  }

  async function update(): Promise<void> {
    await registerWorkspace({ projects: dependencies.projects.value.map((project) => project.id), terminals: dependencies.tabs.map((tab) => ({ id: tab.id, projectId: tab.projectId })) });
  }

  async function start(): Promise<() => void> {
    return listen<WorkspaceControlEvent>("termarc://workspace-control-request", async ({ payload }) => {
      try { await acknowledgeWorkspaceControl({ requestId: payload.requestId, result: await dispatch(payload) }); }
      catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        const code = typeof reason === "object" && reason && "code" in reason && typeof reason.code === "string" ? reason.code : "workspace_error";
        await acknowledgeWorkspaceControl({ requestId: payload.requestId, error: { code, message } }).catch(console.error);
      }
    });
  }
  return { start, update };
}
