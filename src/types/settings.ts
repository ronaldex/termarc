export type ColorTheme = string;

export type ExternalEditor = "vscode" | "vscodium" | "phpstorm";
export type ShortcutModifier = "meta" | "ctrl";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
  colorTheme: ColorTheme;
  externalEditor: ExternalEditor;
  notifyWhenAgentReady: boolean;
  playSoundWhenAgentReady: boolean;
  shortcutModifier: ShortcutModifier;
}
