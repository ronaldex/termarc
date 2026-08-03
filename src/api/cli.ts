import { invoke } from "@tauri-apps/api/core";

export function installCliSymlink(): Promise<string> {
  return invoke("install_symlink");
}
