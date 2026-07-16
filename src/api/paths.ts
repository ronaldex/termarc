import { invoke } from "@tauri-apps/api/core";

export type TerminalPath = {
  path: string;
  kind: "directory" | "file";
};

export function resolveTerminalPath(cwd: string, path: string): Promise<TerminalPath | null> {
  return invoke<TerminalPath | null>("resolve_terminal_path", { cwd, path });
}

export function openTerminalPath(path: string): Promise<void> {
  return invoke("open_terminal_path", { path });
}
