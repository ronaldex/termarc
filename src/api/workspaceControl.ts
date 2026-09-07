import { invoke } from "@tauri-apps/api/core";

export type WorkspaceTerminalSnapshot = { id: string; projectId: string };
export type WorkspaceSnapshot = { projects: string[]; terminals: WorkspaceTerminalSnapshot[] };

export type WorkspaceAction = {
  resource: "terminals" | "subterminals" | "agents" | "commands";
  action: "list" | "status" | "create" | "run" | "send" | "wait" | "stop" | "close";
  id?: string;
  projectId?: string;
  parentTerminalId?: string;
  cwd?: string;
  name?: string;
  text?: string;
  timeoutMs?: number;
};

type WorkspaceControlEvent = { requestId: string; protocolVersion: number } & WorkspaceAction;
type WorkspaceError = { code: string; message: string };

export function registerWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  return invoke("register_workspace", { snapshot });
}

export function acknowledgeWorkspaceControl(acknowledgement: {
  requestId: string;
  result?: unknown;
  error?: WorkspaceError;
}): Promise<void> {
  return invoke("acknowledge_workspace_control", { acknowledgement });
}

export type { WorkspaceControlEvent, WorkspaceError };
