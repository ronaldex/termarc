import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function readClipboardText(): Promise<string> {
  return (await readText()) ?? "";
}

export async function writeClipboardText(text: string): Promise<void> {
  await writeText(text);
}
