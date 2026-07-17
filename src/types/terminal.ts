import type { FitAddon } from "@xterm/addon-fit";
import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

export type PtyEvent = {
  event: "exit" | "error";
  exitCode?: number;
  message?: string;
};

export type PtyStarted = {
  id: string;
  pid?: number;
  shell: string;
};

export type AgentKind = "pi";
export type AgentState = "processing" | "waiting";

export type PtyStatus = {
  processName?: string;
  agent?: AgentKind;
  cwd?: string;
};

export type TerminalStatus = "starting" | "running" | "stopped" | "error";

export type TerminalActivity = {
  processName?: string;
  agent?: AgentKind;
  agentState?: AgentState;
  lastCommandExitCode?: number;
  currentCwd?: string;
};

/** Serializable state consumed by workspace and sidebar components. */
export type TerminalTabState = TerminalActivity & {
  id: string;
  number: number;
  title: string;
  name?: string;
  terminalTitle?: string;
  detail: string;
  projectId: string;
  cwd: string;
  status: TerminalStatus;
};

/** Runtime-only resources owned by the terminal tabs facade. */
export type TerminalRuntime = {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon?: WebglAddon;
  webglFailed: boolean;
  container?: HTMLDivElement;
  session?: PtyStarted;
  startGeneration: number;
  writeQueue: Promise<unknown>;
  disposed: boolean;
};

export type TerminalTab = TerminalTabState & TerminalRuntime;
