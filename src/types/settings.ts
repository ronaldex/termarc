export type ColorTheme =
  | "termdeck"
  | "catppuccin-latte"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "catppuccin-mocha";

export type ExternalEditor = "vscode" | "vscodium" | "phpstorm";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
  colorTheme: ColorTheme;
  externalEditor: ExternalEditor;
  notifyWhenAgentReady: boolean;
  playSoundWhenAgentReady: boolean;
}
