export type ContextMenuRequestBase = {
  x: number;
  y: number;
  trigger: HTMLElement;
};

export type TerminalContextMenuRequest = ContextMenuRequestBase & {
  kind: "terminal";
  tabId: string;
};

export type CommandContextMenuRequest = ContextMenuRequestBase & {
  kind: "command" | "agent";
  projectId: string;
  commandId: string;
};

export type SidebarContextMenuRequest = TerminalContextMenuRequest | CommandContextMenuRequest;
