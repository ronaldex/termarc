export type ColorTheme = string;

export type ExternalEditor = "vscode" | "vscodium" | "phpstorm";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
  colorTheme: ColorTheme;
  externalEditor: ExternalEditor;
  notifyWhenAgentReady: boolean;
  playSoundWhenAgentReady: boolean;
}
