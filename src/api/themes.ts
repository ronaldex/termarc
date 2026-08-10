import { invoke } from "@tauri-apps/api/core";
import type { ThemeDefinition } from "../themes/themeCatalog";

type LoadedTheme = ThemeDefinition & { id: string };

export function loadCustomThemes(): Promise<LoadedTheme[]> {
  return invoke<LoadedTheme[]>("load_custom_themes");
}
