import { invoke } from "@tauri-apps/api/core";
import type { ExternalEditor } from "../types/settings";

export type TerminalPath = {
  path: string;
  kind: "directory" | "file";
};

export function resolveTerminalPath(cwd: string, path: string): Promise<TerminalPath | null> {
  return invoke<TerminalPath | null>("resolve_terminal_path", { cwd, path });
}

export function openTerminalPath(path: string, editor: ExternalEditor): Promise<void> {
  return invoke("open_terminal_path", { path, editor });
}
