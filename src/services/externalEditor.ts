import { openTerminalPath } from "../api/paths";
import type { ExternalEditor } from "../types/settings";

export type ExternalOpenTarget = {
  path: string;
  line?: number;
  column?: number;
};

export function openPath(
  target: string | ExternalOpenTarget,
  editor: ExternalEditor,
): Promise<void> {
  const path = typeof target === "string" ? target : target.path;
  return openTerminalPath(path, editor);
}
