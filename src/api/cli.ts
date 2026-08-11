import { invoke } from "@tauri-apps/api/core";

export function installCliSymlink(): Promise<string> {
  return invoke("install_symlink");
}

export function isCliSymlinkInstalled(): Promise<boolean> {
  return invoke("is_symlink_installed");
}

export function removeCliSymlink(): Promise<string> {
  return invoke("remove_symlink");
}
