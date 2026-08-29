type ProjectSelectionKind =
  "project" | "terminals" | "add-terminal" | "commands" | "add-command" | "agents" | "add-agent";

export type SidebarSelection =
  | { id: string; kind: "projects"; projectId?: string }
  | { id: string; kind: ProjectSelectionKind; projectId: string }
  | { id: string; kind: "terminal"; projectId: string; tabId: string }
  | {
      id: string;
      kind: "subagent";
      projectId: string;
      tabId: string;
      parentTerminalId?: string;
    }
  | {
      id: string;
      kind: "command" | "edit-command" | "agent" | "edit-agent";
      projectId: string;
      commandId: string;
    }
  | { id: string; kind: "app-settings" }
  | { id: string; kind: "keyboard-shortcuts" };

export type SidebarSelectionKind = SidebarSelection["kind"];
