type ProjectSelectionKind = "project" | "terminals" | "add-terminal" | "commands" | "add-command";

export type SidebarSelection =
  | { id: string; kind: "projects"; projectId?: string }
  | { id: string; kind: ProjectSelectionKind; projectId: string }
  | { id: string; kind: "terminal"; projectId: string; tabId: string }
  | { id: string; kind: "command" | "edit-command"; projectId: string; commandId: string }
  | { id: string; kind: "app-settings" };

export type SidebarSelectionKind = SidebarSelection["kind"];
