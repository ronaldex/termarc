import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

export interface DirectoryPickerOptions {
  title?: string;
  /** Starting directory for the picker. A leading `~` expands to the user home. */
  defaultPath?: string;
}

/**
 * Opens the native directory picker and resolves to the selected path,
 * or null when the picker is cancelled.
 */
export async function selectDirectory(
  options: DirectoryPickerOptions = {},
): Promise<string | null> {
  const selected = await open({
    directory: true,
    title: options.title,
    defaultPath: options.defaultPath ? await expandHomePath(options.defaultPath) : undefined,
  });
  return typeof selected === "string" ? selected : null;
}

async function expandHomePath(path: string): Promise<string> {
  if (path !== "~" && !path.startsWith("~/")) return path;
  const home = (await homeDir()).replace(/\/$/, "");
  const relative = path.slice(path === "~" ? 1 : 2);
  return relative ? `${home}/${relative}` : home;
}
