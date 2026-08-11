import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "termarc-settings";

function mockStorage(saved: string | null = null, storageKey = STORAGE_KEY) {
  const values = new Map<string, string>();
  if (saved !== null) values.set(storageKey, saved);

  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn(() => null),
    get length() {
      return values.size;
    },
  } satisfies Storage;

  vi.stubGlobal("localStorage", storage);
  return storage;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("useAppSettings persistence", () => {
  it("migrates legacy settings into the validated versioned format", async () => {
    const storage = mockStorage(
      JSON.stringify({
        terminalFontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
        terminalFontSize: "18",
        notifyWhenAgentReady: "yes",
        playSoundWhenAgentReady: false,
      }),
    );
    const { useAppSettings } = await import("./useAppSettings");

    const { settings, load } = useAppSettings();
    load();

    expect(settings).toMatchObject({
      terminalFontSize: 13,
      notifyWhenAgentReady: false,
      playSoundWhenAgentReady: false,
    });
    expect(settings.terminalFontFamily).toContain("Termarc JetBrainsMono Nerd Font");
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toEqual({
      version: 2,
      settings: { ...settings },
    });
  });

  it("migrates the old mixed-width Nerd Font fallback", async () => {
    const storage = mockStorage(
      JSON.stringify({
        version: 1,
        settings: {
          terminalFontFamily:
            '"JetBrains Mono", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, monospace',
          terminalFontSize: 13,
          notifyWhenAgentReady: false,
          playSoundWhenAgentReady: true,
        },
      }),
    );
    const { useAppSettings } = await import("./useAppSettings");

    const { settings, load } = useAppSettings();
    load();

    expect(settings.terminalFontFamily).toContain("Termarc JetBrainsMono Nerd Font");
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-range font sizes and non-boolean preferences", async () => {
    const storage = mockStorage(
      JSON.stringify({
        version: 1,
        settings: {
          terminalFontFamily: "Monaco",
          terminalFontSize: 73,
          colorTheme: "unknown",
          notifyWhenAgentReady: 1,
          playSoundWhenAgentReady: null,
        },
      }),
    );
    const { useAppSettings } = await import("./useAppSettings");

    const { settings, load } = useAppSettings();
    load();

    expect(settings).toEqual({
      terminalFontFamily: "Monaco",
      terminalFontSize: 13,
      colorTheme: "termarc",
      externalEditor: "vscodium",
      notifyWhenAgentReady: false,
      playSoundWhenAgentReady: true,
    });
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toEqual({
      version: 2,
      settings: { ...settings },
    });
  });

  it("loads a supported external editor", async () => {
    const storage = mockStorage(
      JSON.stringify({
        version: 2,
        settings: {
          terminalFontFamily: "Monaco",
          terminalFontSize: 16,
          colorTheme: "catppuccin-mocha",
          externalEditor: "phpstorm",
          notifyWhenAgentReady: false,
          playSoundWhenAgentReady: true,
        },
      }),
    );
    const { useAppSettings } = await import("./useAppSettings");

    const { settings, load } = useAppSettings();
    load();

    expect(settings.externalEditor).toBe("phpstorm");
    expect(settings.colorTheme).toBe("catppuccin-mocha");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("loads once and installs one watcher across multiple consumers", async () => {
    const storage = mockStorage(
      JSON.stringify({
        version: 2,
        settings: {
          terminalFontFamily: "Monaco",
          terminalFontSize: 16,
          colorTheme: "termarc",
          externalEditor: "vscodium",
          notifyWhenAgentReady: false,
          playSoundWhenAgentReady: true,
        },
      }),
    );
    const { useAppSettings } = await import("./useAppSettings");
    const first = useAppSettings();
    const second = useAppSettings();
    const third = useAppSettings();

    first.load();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, settings: { terminalFontSize: 30 } }),
    );
    second.load();
    third.load();
    expect(first.settings.terminalFontSize).toBe(16);

    storage.setItem.mockClear();
    second.settings.terminalFontSize = 17;
    await nextTick();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toMatchObject({
      version: 2,
      settings: { terminalFontSize: 17 },
    });
  });
});
