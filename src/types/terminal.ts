import type { FitAddon } from "@xterm/addon-fit";
import type { WebglAddon } from "@xterm/addon-webgl";
import type { IDisposable, Terminal } from "@xterm/xterm";

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

export type TerminalLaunch =
  | { kind: "shell" }
  | {
      kind: "command";
      commandId: string;
      commandLine: string;
    };

export type TerminalActivity = {
  processName?: string;
  agent?: AgentKind;
  agentState?: AgentState;
  /** Exit code of the shell process itself, distinct from a command run inside the shell. */
  terminalExitCode?: number;
  lastCommandExitCode?: number;
  currentCwd?: string;
};

/** Serializable state consumed by workspace and sidebar components. */
export type TerminalTabState = TerminalActivity & {
  id: string;
  number: number;
  shortcutNumber?: number;
  title: string;
  /** A user-selected title that always takes display precedence. */
  customTitle?: string;
  /** The current command's configured label. */
  launchTitle?: string;
  /** Title reported by xterm's terminal title sequence. */
  terminalTitle?: string;
  detail: string;
  projectId: string;
  cwd: string;
  launch: TerminalLaunch;
  status: TerminalStatus;
};

/** Runtime-only resources owned by the terminal tabs facade. */
export type TerminalRuntime = {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon?: WebglAddon;
  linkDisposable?: IDisposable;
  copyDisposable?: IDisposable;
  webglFailed: boolean;
  container?: HTMLDivElement;
  session?: PtyStarted;
  startGeneration: number;
  stopRequested: boolean;
  writeQueue: Promise<unknown>;
  pendingWriteBytes: number;
  pendingWriteCount: number;
  disposed: boolean;
};

export type TerminalTab = TerminalTabState & TerminalRuntime;
