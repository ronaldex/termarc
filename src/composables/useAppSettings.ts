import { reactive, watch } from "vue";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  isExternalEditor,
  isTerminalFont,
  isTerminalFontSize,
} from "../settings/options";
import { THEME_CATALOG } from "../themes/themeCatalog";
import type { AppSettings, ColorTheme } from "../types/settings";

const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontSize: 13,
  colorTheme: "termdeck",
  externalEditor: "vscodium",
  notifyWhenAgentReady: false,
  playSoundWhenAgentReady: true,
};

const STORAGE_KEY = "termdeck-settings";
const STORAGE_VERSION = 2;
const LEGACY_FONT_FAMILIES = new Set([
  '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  '"JetBrains Mono", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, monospace',
  '"JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace',
]);

interface PersistedSettings {
  version: typeof STORAGE_VERSION;
  settings: AppSettings;
}

type LoadedSettings = {
  settings: AppSettings;
  needsSaving: boolean;
};

const settings = reactive<AppSettings>({ ...DEFAULT_SETTINGS });
let initialized = false;
let persistenceStarted = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === "string" && Object.hasOwn(THEME_CATALOG, value);
}

function isValidSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    isTerminalFont(value.terminalFontFamily) &&
    isTerminalFontSize(value.terminalFontSize) &&
    isColorTheme(value.colorTheme) &&
    isExternalEditor(value.externalEditor) &&
    typeof value.notifyWhenAgentReady === "boolean" &&
    typeof value.playSoundWhenAgentReady === "boolean"
  );
}

function validatedSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  return {
    terminalFontFamily:
      isTerminalFont(value.terminalFontFamily) &&
      !LEGACY_FONT_FAMILIES.has(value.terminalFontFamily)
        ? value.terminalFontFamily
        : DEFAULT_SETTINGS.terminalFontFamily,
    terminalFontSize: isTerminalFontSize(value.terminalFontSize)
      ? value.terminalFontSize
      : DEFAULT_SETTINGS.terminalFontSize,
    colorTheme: isColorTheme(value.colorTheme) ? value.colorTheme : DEFAULT_SETTINGS.colorTheme,
    externalEditor: isExternalEditor(value.externalEditor)
      ? value.externalEditor
      : DEFAULT_SETTINGS.externalEditor,
    notifyWhenAgentReady:
      typeof value.notifyWhenAgentReady === "boolean"
        ? value.notifyWhenAgentReady
        : DEFAULT_SETTINGS.notifyWhenAgentReady,
    playSoundWhenAgentReady:
      typeof value.playSoundWhenAgentReady === "boolean"
        ? value.playSoundWhenAgentReady
        : DEFAULT_SETTINGS.playSoundWhenAgentReady,
  };
}

export function migrateSettings(value: unknown): LoadedSettings {
  if (!isRecord(value)) return { settings: { ...DEFAULT_SETTINGS }, needsSaving: true };

  if (value.version === STORAGE_VERSION) {
    return {
      settings: validatedSettings(value.settings),
      needsSaving: !isValidSettings(value.settings),
    };
  }

  if (value.version === 1 && isRecord(value.settings)) {
    return { settings: validatedSettings(value.settings), needsSaving: true };
  }

  if (!("version" in value)) {
    return { settings: validatedSettings(value), needsSaving: true };
  }

  return { settings: { ...DEFAULT_SETTINGS }, needsSaving: true };
}

function persistedSettings(): PersistedSettings {
  return {
    version: STORAGE_VERSION,
    settings: { ...settings },
  };
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedSettings()));
  } catch (error) {
    console.error("Could not save settings", error);
  }
}

function startPersistence(): void {
  if (persistenceStarted) return;
  persistenceStarted = true;
  watch(settings, save, { deep: true });
}

function load(): void {
  if (initialized) return;
  initialized = true;

  let settingsNeedSaving = false;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const migrated = migrateSettings(JSON.parse(saved) as unknown);
      Object.assign(settings, migrated.settings);
      settingsNeedSaving = migrated.needsSaving;
    }
  } catch (error) {
    console.error("Could not load settings", error);
  }

  startPersistence();
  if (settingsNeedSaving) save();
}

export function useAppSettings() {
  return {
    settings,
    load,
  };
}
