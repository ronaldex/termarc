import { Terminal } from "@xterm/xterm";

export type TerminalAppearance = {
  fontFamily: string;
  fontSize: number;
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
    rescaleOverlappingGlyphs: true,
    scrollback: 10_000,
    smoothScrollDuration: 100,
    theme: {
      background: "#0b0d12",
      foreground: "#d8dee9",
      cursor: "#8be9fd",
      cursorAccent: "#0b0d12",
      selectionBackground: "#3d59a880",
      black: "#1b1d23",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
  });
}
