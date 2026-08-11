import type { ExternalEditor } from "../types/settings";

export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"Termarc JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace';

export const TERMINAL_FONT_OPTIONS = [
  { label: "Termarc JetBrains Mono", value: DEFAULT_TERMINAL_FONT_FAMILY },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "SF Mono", value: '"SFMono-Regular", "SF Mono", monospace' },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Monaco", value: "Monaco" },
  { label: "Consolas", value: "Consolas" },
  { label: "System monospace", value: "monospace" },
] as const;

export const TERMINAL_FONT_SIZE_OPTIONS = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32,
] as const;

export const EXTERNAL_EDITOR_OPTIONS = [
  { value: "vscode", label: "Visual Studio Code" },
  { value: "vscodium", label: "VSCodium" },
  { value: "phpstorm", label: "PhpStorm" },
] as const satisfies ReadonlyArray<{ value: ExternalEditor; label: string }>;

const terminalFonts = new Set<string>(TERMINAL_FONT_OPTIONS.map(({ value }) => value));
const terminalFontSizes = new Set<number>(TERMINAL_FONT_SIZE_OPTIONS);
const externalEditors = new Set<ExternalEditor>(EXTERNAL_EDITOR_OPTIONS.map(({ value }) => value));

export function isTerminalFont(value: unknown): value is string {
  return typeof value === "string" && terminalFonts.has(value);
}

export function isTerminalFontSize(value: unknown): value is number {
  return typeof value === "number" && terminalFontSizes.has(value);
}

export function isExternalEditor(value: unknown): value is ExternalEditor {
  return typeof value === "string" && externalEditors.has(value as ExternalEditor);
}

export function resolveExternalEditor(
  projectEditor: ExternalEditor | undefined,
  appEditor: ExternalEditor,
): ExternalEditor {
  return projectEditor ?? appEditor;
}

export function externalEditorLabel(editor: ExternalEditor): string {
  return EXTERNAL_EDITOR_OPTIONS.find(({ value }) => value === editor)?.label ?? editor;
}
