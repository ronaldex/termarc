import { reactive, watch } from "vue";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
}

const DEFAULT_FONT_FAMILY =
  '"JetBrains Mono", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, monospace';

const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: DEFAULT_FONT_FAMILY,
  terminalFontSize: 13,
};

const settings = reactive<AppSettings>({ ...DEFAULT_SETTINGS });

export function useAppSettings() {
  function load() {
    try {
      const saved = localStorage.getItem("termdeck-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed.terminalFontFamily === '"JetBrains Mono", "SFMono-Regular", Consolas, monospace' ||
          parsed.terminalFontFamily ===
            '"JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace'
        ) {
          parsed.terminalFontFamily = DEFAULT_FONT_FAMILY;
        }
        Object.assign(settings, parsed);
      }
    } catch (e) {
      console.error("Could not load settings", e);
    }
  }

  function save() {
    try {
      localStorage.setItem("termdeck-settings", JSON.stringify(settings));
    } catch (e) {
      console.error("Could not save settings", e);
    }
  }

  watch(settings, save, { deep: true });

  return {
    settings,
    load,
  };
}
