import type { ITheme } from "@xterm/xterm";
import catppuccinFrappe from "./builtin/catppuccin-frappe.json";
import catppuccinLatte from "./builtin/catppuccin-latte.json";
import catppuccinMacchiato from "./builtin/catppuccin-macchiato.json";
import catppuccinMocha from "./builtin/catppuccin-mocha.json";
import termarc from "./builtin/termarc.json";

export type ThemeColorScheme = "light" | "dark";

export const THEME_TOKEN_NAMES = [
  "app-bg",
  "panel-bg",
  "sidebar-bg",
  "sidebar-bg-deep",
  "surface-base",
  "surface-raised",
  "surface-active",
  "surface-emphasis",
  "surface-hover",
  "border-muted",
  "border",
  "border-strong",
  "text",
  "text-strong",
  "text-muted",
  "text-subtle",
  "text-faint",
  "accent",
  "accent-hover",
  "accent-bg",
  "focus",
  "status-running",
  "status-starting",
  "status-error",
  "success-bg",
  "danger-bg",
  "selection",
  "terminal-black",
  "terminal-red",
  "terminal-green",
  "terminal-yellow",
  "terminal-blue",
  "terminal-magenta",
  "terminal-cyan",
  "terminal-white",
  "terminal-bright-black",
  "terminal-bright-white",
] as const;

export type AppThemeTokens = Record<(typeof THEME_TOKEN_NAMES)[number], string>;

export type ThemeDefinition = {
  label: string;
  colorScheme: ThemeColorScheme;
  tokens: AppThemeTokens;
};

const BUILTIN_THEME_FILES = [
  ["termarc", termarc],
  ["catppuccin-latte", catppuccinLatte],
  ["catppuccin-frappe", catppuccinFrappe],
  ["catppuccin-macchiato", catppuccinMacchiato],
  ["catppuccin-mocha", catppuccinMocha],
] as const;

type ThemeFile = Omit<ThemeDefinition, "id"> & {
  version: 1;
};

export const THEME_CATALOG = Object.fromEntries(
  (BUILTIN_THEME_FILES as unknown as readonly (readonly [string, ThemeFile])[]).map(
    ([id, { label, colorScheme, tokens }]) => [id, { label, colorScheme, tokens }],
  ),
) as Record<string, ThemeDefinition>;

export const COLOR_THEME_OPTIONS = Object.entries(THEME_CATALOG).map(([value, theme]) => ({
  value,
  label: theme.label,
}));

export function registerCustomThemes(themes: Record<string, ThemeDefinition>): void {
  for (const [id, theme] of Object.entries(themes)) {
    if (Object.hasOwn(THEME_CATALOG, id)) continue;
    THEME_CATALOG[id] = theme;
    COLOR_THEME_OPTIONS.push({ value: id, label: theme.label });
  }
}

export function themeDefinition(theme: string): ThemeDefinition {
  return THEME_CATALOG[theme] ?? THEME_CATALOG.termarc!;
}

export function applyAppTheme(theme: string, root: HTMLElement = document.documentElement): void {
  const definition = themeDefinition(theme);
  root.dataset.theme = theme;
  root.style.colorScheme = definition.colorScheme;
  for (const [token, value] of Object.entries(definition.tokens)) {
    root.style.setProperty(`--color-${token}`, value);
  }
}

export function terminalTheme(theme: string): ITheme {
  const { tokens } = themeDefinition(theme);
  return {
    background: tokens["app-bg"],
    foreground: tokens.text,
    cursor: tokens["terminal-cyan"],
    cursorAccent: tokens["app-bg"],
    overviewRulerBorder: tokens["app-bg"],
    scrollbarSliderActiveBackground: "rgba(144, 147, 154, 0.5)",
    scrollbarSliderBackground: "rgba(144, 147, 154, 0.32)",
    scrollbarSliderHoverBackground: "rgba(144, 147, 154, 0.5)",
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
