import { reactive, watch } from "vue";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  isExternalEditor,
  isTerminalFont,
  SHORTCUT_MODIFIER_OPTIONS,
  isTerminalFontSize,
} from "../settings/options";
import { THEME_CATALOG } from "../themes/themeCatalog";
import type { AppSettings, ColorTheme, ShortcutModifier } from "../types/settings";
import { defaultShortcutModifier } from "../utils/platform";

const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontSize: 13,
  colorTheme: "termarc",
  externalEditor: "vscodium",
  notifyWhenAgentReady: false,
  playSoundWhenAgentReady: true,
  shortcutModifier: defaultShortcutModifier(),
};

const STORAGE_KEY = "termarc-settings";
const STORAGE_VERSION = 2;

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
    typeof value.playSoundWhenAgentReady === "boolean" &&
    SHORTCUT_MODIFIER_OPTIONS.some((option) => option.value === value.shortcutModifier)
  );
}

function validatedSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  return {
    terminalFontFamily: isTerminalFont(value.terminalFontFamily)
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
    shortcutModifier: SHORTCUT_MODIFIER_OPTIONS.some(
      (option) => option.value === value.shortcutModifier,
    )
      ? (value.shortcutModifier as ShortcutModifier)
      : DEFAULT_SETTINGS.shortcutModifier,
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

  // Version 3 briefly existed in development with a split-view preference.
  // Read it and save the released schema while discarding that obsolete field.
  if ((value.version === 1 || value.version === 3) && isRecord(value.settings)) {
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
