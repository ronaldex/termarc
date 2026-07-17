import { Terminal } from "@xterm/xterm";

export type TerminalAppearance = {
  fontFamily: string;
  fontSize: number;
};

export async function prepareTerminalFonts(): Promise<void> {
  // xterm measures its cell size when it opens. Do not let its initial render
  // use a fallback font while the bundled faces are still loading.
  await document.fonts.load('400 13px "JetBrains Mono"', "term-deck");
  await document.fonts.load('400 13px "Symbols Nerd Font Mono"', "\u{f07c}");
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
    // Nerd Font symbols can have wider metrics than the primary text face.
    // Keep fallback glyphs inside their xterm cell so icons do not overlap text.
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
