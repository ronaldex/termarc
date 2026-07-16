export type SidebarSelectionKind =
  | "projects"
  | "project"
  | "terminals"
  | "terminal"
  | "add-terminal"
  | "commands"
  | "add-command"
  | "app-settings";

export type SidebarSelection = {
  id: string;
  kind: SidebarSelectionKind;
  projectId?: string;
  tabId?: string;
};
