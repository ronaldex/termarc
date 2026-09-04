import { Terminal } from "@xterm/xterm";
import type { ColorTheme } from "../types/settings";
import { terminalTheme } from "./terminalThemes";

export type TerminalAppearance = {
  fontFamily: string;
  fontSize: number;
  colorTheme: ColorTheme;
};

let fontPreparation: Promise<void> | undefined;

export function prepareTerminalFonts(): Promise<void> {
  // xterm measures its cell size when it opens. Share this work across every
  // terminal; a failed attempt is cleared so a later activation can retry.
  if (!fontPreparation) {
    fontPreparation = Promise.all([
      document.fonts.load('400 13px "Termarc JetBrainsMono Nerd Font"', "termarc \u{f07c}"),
      document.fonts.load('600 13px "Termarc JetBrainsMono Nerd Font"', "termarc \u{f07c}"),
      document.fonts.ready,
    ])
      .then(() => undefined)
      .catch((error) => {
        fontPreparation = undefined;
        throw error;
      });
  }
  return fontPreparation;
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
