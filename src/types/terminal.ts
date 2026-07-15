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

export type TerminalStatus = "starting" | "running" | "stopped" | "error";

export type TerminalTab = {
  id: string;
  number: number;
  title: string;
  detail: string;
  cwd: string;
  status: TerminalStatus;
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
