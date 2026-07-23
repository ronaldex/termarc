import type { ITheme } from "@xterm/xterm";
import type { ColorTheme } from "../types/settings";

export type ThemeColorScheme = "light" | "dark";

type AppThemeTokens = Record<
  | "app-bg"
  | "panel-bg"
  | "sidebar-bg"
  | "sidebar-bg-deep"
  | "surface-0"
  | "surface-1"
  | "surface-2"
  | "surface-3"
  | "surface-hover"
  | "border-muted"
  | "border"
  | "border-strong"
  | "text"
  | "text-strong"
  | "text-muted"
  | "text-subtle"
  | "text-faint"
  | "accent"
  | "accent-hover"
  | "accent-bg"
  | "focus"
  | "status-running"
  | "status-starting"
  | "status-error"
  | "success-bg"
  | "danger-bg"
  | "selection"
  | "terminal-black"
  | "terminal-red"
  | "terminal-green"
  | "terminal-yellow"
  | "terminal-blue"
  | "terminal-magenta"
  | "terminal-cyan"
  | "terminal-white"
  | "terminal-bright-black"
  | "terminal-bright-white",
  string
>;

export type ThemeDefinition = {
  label: string;
  colorScheme: ThemeColorScheme;
  tokens: AppThemeTokens;
};

export const THEME_CATALOG: Record<ColorTheme, ThemeDefinition> = {
  termdeck: {
    label: "Termdeck",
    colorScheme: "dark",
    tokens: {
      "app-bg": "#0c0d0f",
      "panel-bg": "#101113",
      "sidebar-bg": "#151617",
      "sidebar-bg-deep": "#0f1011",
      "surface-0": "#121315",
      "surface-1": "#18191b",
      "surface-2": "#202225",
      "surface-3": "#292b2f",
      "surface-hover": "#303238",
      "border-muted": "#222428",
      border: "#2b2d32",
      "border-strong": "#3a3d44",
      text: "#d8d9dc",
      "text-strong": "#eef0f3",
      "text-muted": "#96999f",
      "text-subtle": "#777a82",
      "text-faint": "#62656c",
      accent: "#7aa2f7",
      "accent-hover": "#9bb7fa",
      "accent-bg": "#293149",
      focus: "#6284ff",
      "status-running": "#9ece6a",
      "status-starting": "#e0af68",
      "status-error": "#f7768e",
      "success-bg": "#173526",
      "danger-bg": "#3b2026",
      selection: "#3d59a880",
      "terminal-black": "#1b1d23",
      "terminal-red": "#f7768e",
      "terminal-green": "#9ece6a",
      "terminal-yellow": "#e0af68",
      "terminal-blue": "#7aa2f7",
      "terminal-magenta": "#bb9af7",
      "terminal-cyan": "#7dcfff",
      "terminal-white": "#a9b1d6",
      "terminal-bright-black": "#61646d",
      "terminal-bright-white": "#d8d9dc",
    },
  },
  "catppuccin-latte": {
    label: "Catppuccin Latte",
    colorScheme: "light",
    tokens: {
      "app-bg": "#eff1f5",
      "panel-bg": "#e6e9ef",
      "sidebar-bg": "#e6e9ef",
      "sidebar-bg-deep": "#dce0e8",
      "surface-0": "#eff1f5",
      "surface-1": "#e6e9ef",
      "surface-2": "#dce0e8",
      "surface-3": "#ccd0da",
      "surface-hover": "#bcc0cc",
      "border-muted": "#dce0e8",
      border: "#ccd0da",
      "border-strong": "#bcc0cc",
      text: "#4c4f69",
      "text-strong": "#3c3f59",
      "text-muted": "#6c6f85",
      "text-subtle": "#7c7f93",
      "text-faint": "#8c8fa1",
      accent: "#8839ef",
      "accent-hover": "#ea76cb",
      "accent-bg": "#eadff8",
      focus: "#8839ef",
      "status-running": "#40a02b",
      "status-starting": "#df8e1d",
      "status-error": "#d20f39",
      "success-bg": "#dcebd8",
      "danger-bg": "#f4d8df",
      selection: "#8839ef33",
      "terminal-black": "#5c5f77",
      "terminal-red": "#d20f39",
      "terminal-green": "#40a02b",
      "terminal-yellow": "#df8e1d",
      "terminal-blue": "#1e66f5",
      "terminal-magenta": "#8839ef",
      "terminal-cyan": "#179299",
      "terminal-white": "#acb0be",
      "terminal-bright-black": "#7c7f93",
      "terminal-bright-white": "#4c4f69",
    },
  },
  "catppuccin-frappe": {
    label: "Catppuccin Frappé",
    colorScheme: "dark",
    tokens: {
      "app-bg": "#303446",
      "panel-bg": "#292c3c",
      "sidebar-bg": "#292c3c",
      "sidebar-bg-deep": "#232634",
      "surface-0": "#303446",
      "surface-1": "#363a4f",
      "surface-2": "#414559",
      "surface-3": "#51576d",
      "surface-hover": "#626880",
      "border-muted": "#363a4f",
      border: "#414559",
      "border-strong": "#51576d",
      text: "#c6d0f5",
      "text-strong": "#f2d5cf",
      "text-muted": "#a5adce",
      "text-subtle": "#949cbb",
      "text-faint": "#838ba7",
      accent: "#ca9ee6",
      "accent-hover": "#f4b8e4",
      "accent-bg": "#51415f",
      focus: "#ca9ee6",
      "status-running": "#a6d189",
      "status-starting": "#e5c890",
      "status-error": "#e78284",
      "success-bg": "#3f5545",
      "danger-bg": "#5a3b45",
      selection: "#ca9ee655",
      "terminal-black": "#51576d",
      "terminal-red": "#e78284",
      "terminal-green": "#a6d189",
      "terminal-yellow": "#e5c890",
      "terminal-blue": "#8caaee",
      "terminal-magenta": "#ca9ee6",
      "terminal-cyan": "#81c8be",
      "terminal-white": "#b5bfe2",
      "terminal-bright-black": "#737994",
      "terminal-bright-white": "#c6d0f5",
    },
  },
  "catppuccin-macchiato": {
    label: "Catppuccin Macchiato",
    colorScheme: "dark",
    tokens: {
      "app-bg": "#24273a",
      "panel-bg": "#1e2030",
      "sidebar-bg": "#1e2030",
      "sidebar-bg-deep": "#181926",
      "surface-0": "#24273a",
      "surface-1": "#363a4f",
      "surface-2": "#494d64",
      "surface-3": "#5b6078",
      "surface-hover": "#6e738d",
      "border-muted": "#363a4f",
      border: "#494d64",
      "border-strong": "#5b6078",
      text: "#cad3f5",
      "text-strong": "#f4dbd6",
      "text-muted": "#a5adcb",
      "text-subtle": "#939ab7",
      "text-faint": "#8087a2",
      accent: "#c6a0f6",
      "accent-hover": "#f5bde6",
      "accent-bg": "#493b61",
      focus: "#c6a0f6",
      "status-running": "#a6da95",
      "status-starting": "#eed49f",
      "status-error": "#ed8796",
      "success-bg": "#354f45",
      "danger-bg": "#573641",
      selection: "#c6a0f655",
      "terminal-black": "#494d64",
      "terminal-red": "#ed8796",
      "terminal-green": "#a6da95",
      "terminal-yellow": "#eed49f",
      "terminal-blue": "#8aadf4",
      "terminal-magenta": "#c6a0f6",
      "terminal-cyan": "#8bd5ca",
      "terminal-white": "#b8c0e0",
      "terminal-bright-black": "#6e738d",
      "terminal-bright-white": "#cad3f5",
    },
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    colorScheme: "dark",
    tokens: {
      "app-bg": "#1e1e2e",
      "panel-bg": "#181825",
      "sidebar-bg": "#181825",
      "sidebar-bg-deep": "#11111b",
      "surface-0": "#1e1e2e",
      "surface-1": "#313244",
      "surface-2": "#45475a",
      "surface-3": "#585b70",
      "surface-hover": "#6c7086",
      "border-muted": "#313244",
      border: "#45475a",
      "border-strong": "#585b70",
      text: "#cdd6f4",
      "text-strong": "#dcc9f8",
      "text-muted": "#a6adc8",
      "text-subtle": "#9399b2",
      "text-faint": "#7f849c",
      accent: "#cba6f7",
      "accent-hover": "#f5c2e7",
      "accent-bg": "#49375f",
      focus: "#cba6f7",
      "status-running": "#a6e3a1",
      "status-starting": "#f9e2af",
      "status-error": "#f38ba8",
      "success-bg": "#304a42",
      "danger-bg": "#54333f",
      selection: "#cba6f755",
      "terminal-black": "#45475a",
      "terminal-red": "#f38ba8",
      "terminal-green": "#a6e3a1",
      "terminal-yellow": "#f9e2af",
      "terminal-blue": "#89b4fa",
      "terminal-magenta": "#cba6f7",
      "terminal-cyan": "#94e2d5",
      "terminal-white": "#bac2de",
      "terminal-bright-black": "#6c7086",
      "terminal-bright-white": "#cdd6f4",
    },
  },
};

export const COLOR_THEME_OPTIONS = Object.entries(THEME_CATALOG).map(([value, theme]) => ({
  value: value as ColorTheme,
  label: theme.label,
}));

export function themeDefinition(theme: ColorTheme): ThemeDefinition {
  return THEME_CATALOG[theme];
}

export function applyAppTheme(
  theme: ColorTheme,
  root: HTMLElement = document.documentElement,
): void {
  const definition = themeDefinition(theme);
  root.dataset.theme = theme;
  root.style.colorScheme = definition.colorScheme;
  for (const [token, value] of Object.entries(definition.tokens)) {
    root.style.setProperty(`--color-${token}`, value);
  }
}

export function terminalTheme(theme: ColorTheme): ITheme {
  const { tokens } = themeDefinition(theme);
  return {
    background: tokens["app-bg"],
    foreground: tokens.text,
    cursor: tokens["terminal-cyan"],
    cursorAccent: tokens["app-bg"],
    selectionBackground: tokens.selection,
    black: tokens["terminal-black"],
    red: tokens["terminal-red"],
    green: tokens["terminal-green"],
    yellow: tokens["terminal-yellow"],
    blue: tokens["terminal-blue"],
    magenta: tokens["terminal-magenta"],
    cyan: tokens["terminal-cyan"],
    white: tokens["terminal-white"],
    brightBlack: tokens["terminal-bright-black"],
    brightRed: tokens["terminal-red"],
    brightGreen: tokens["terminal-green"],
    brightYellow: tokens["terminal-yellow"],
    brightBlue: tokens["terminal-blue"],
    brightMagenta: tokens["terminal-magenta"],
    brightCyan: tokens["terminal-cyan"],
    brightWhite: tokens["terminal-bright-white"],
  };
}
