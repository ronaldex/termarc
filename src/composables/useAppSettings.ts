import { reactive, watch } from "vue";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
  notifyWhenAgentReady: boolean;
  playSoundWhenAgentReady: boolean;
}

const DEFAULT_FONT_FAMILY =
  '"JetBrains Mono", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, monospace';

const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: DEFAULT_FONT_FAMILY,
  terminalFontSize: 13,
  notifyWhenAgentReady: false,
  playSoundWhenAgentReady: true,
};

const STORAGE_KEY = "termdeck-settings";
const STORAGE_VERSION = 1;
const LEGACY_FONT_FAMILIES = new Set([
  '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  '"JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace',
]);

interface PersistedSettings {
  version: typeof STORAGE_VERSION;
  settings: AppSettings;
}

const settings = reactive<AppSettings>({ ...DEFAULT_SETTINGS });
let initialized = false;
let persistenceStarted = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    typeof value.terminalFontFamily === "string" &&
    value.terminalFontFamily.trim().length > 0 &&
    !LEGACY_FONT_FAMILIES.has(value.terminalFontFamily) &&
    typeof value.terminalFontSize === "number" &&
    Number.isFinite(value.terminalFontSize) &&
    value.terminalFontSize >= 8 &&
    value.terminalFontSize <= 72 &&
    typeof value.notifyWhenAgentReady === "boolean" &&
    typeof value.playSoundWhenAgentReady === "boolean"
  );
}

function validatedSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  const terminalFontFamily =
    typeof value.terminalFontFamily === "string" && value.terminalFontFamily.trim().length > 0
      ? value.terminalFontFamily
      : DEFAULT_SETTINGS.terminalFontFamily;
  const terminalFontSize =
    typeof value.terminalFontSize === "number" &&
    Number.isFinite(value.terminalFontSize) &&
    value.terminalFontSize >= 8 &&
    value.terminalFontSize <= 72
      ? value.terminalFontSize
      : DEFAULT_SETTINGS.terminalFontSize;

  return {
    terminalFontFamily: LEGACY_FONT_FAMILIES.has(terminalFontFamily)
      ? DEFAULT_FONT_FAMILY
      : terminalFontFamily,
    terminalFontSize,
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
      const parsed: unknown = JSON.parse(saved);

      if (isRecord(parsed) && parsed.version === STORAGE_VERSION) {
        Object.assign(settings, validatedSettings(parsed.settings));
        settingsNeedSaving = !isValidSettings(parsed.settings);
      } else if (isRecord(parsed) && !("version" in parsed)) {
        Object.assign(settings, validatedSettings(parsed));
        settingsNeedSaving = true;
      }
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
