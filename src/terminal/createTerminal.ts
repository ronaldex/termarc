import { Terminal } from "@xterm/xterm";
import type { ColorTheme } from "../types/settings";
import { terminalTheme } from "./terminalThemes";

export type TerminalAppearance = {
  fontFamily: string;
  fontSize: number;
  colorTheme: ColorTheme;
};

export async function prepareTerminalFonts(): Promise<void> {
  // xterm measures its cell size when it opens. Load both bundled weights
  // first so text and Nerd Font icons always use the same monospace metrics.
  await Promise.all([
    document.fonts.load('400 13px "Termdeck JetBrainsMono Nerd Font"', "term-deck \u{f07c}"),
    document.fonts.load('600 13px "Termdeck JetBrainsMono Nerd Font"', "term-deck \u{f07c}"),
  ]);
  await document.fonts.ready;
}

export function createTerminal(appearance: TerminalAppearance): Terminal {
  return new Terminal({
    allowProposedApi: false,
    convertEol: false,
    cursorBlink: true,
    cursorStyle: "bar",
    cursorWidth: 2,
    drawBoldTextInBrightColors: true,
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    fontWeight: "400",
    fontWeightBold: "600",
    lineHeight: 1.18,
    overviewRuler: { width: 6 },
    rescaleOverlappingGlyphs: true,
    scrollback: 10_000,
    smoothScrollDuration: 100,
    theme: terminalTheme(appearance.colorTheme),
  });
}
