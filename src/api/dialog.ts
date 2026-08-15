import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { expandHomePath } from "../utils/homePath";

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
    defaultPath: options.defaultPath
      ? expandHomePath(options.defaultPath, await homeDir())
      : undefined,
  });
  return typeof selected === "string" ? selected : null;
}
