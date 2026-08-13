import type { IDisposable, Terminal } from "@xterm/xterm";

export type TerminalCopyResult = "copied" | "failed" | "empty";

/**
 * Copy a terminal selection without relying on the focused textarea. This is
 * important for native Edit > Copy actions, which do not consistently target
 * xterm's selection in a webview.
 */
export async function copyTerminalSelection(terminal: Terminal): Promise<TerminalCopyResult> {
  if (!terminal.hasSelection()) return "empty";

  return (await writeClipboardText(terminal.getSelection())) ? "copied" : "failed";
}

/** Install copy handling for both keyboard/native-menu and mouse initiated copies. */
export function installTerminalCopy(
  element: HTMLElement,
  terminal: Terminal,
  onCopy: (result: Exclude<TerminalCopyResult, "empty">) => void,
): IDisposable {
  const handleCopy = (event: ClipboardEvent): void => {
    if (!terminal.hasSelection()) return;

    // Keep xterm's normal clipboard event useful as a synchronous fallback,
    // while also using the async API where the webview supports it.
    const text = terminal.getSelection();
    try {
      event.clipboardData?.setData("text/plain", text);
    } catch {
      // Some webviews expose a read-only DataTransfer for native menu copies.
    }
    event.preventDefault();
    void writeClipboardText(text).then((copied) => onCopy(copied ? "copied" : "failed"));
  };

  element.addEventListener("copy", handleCopy);
  return {
    dispose() {
      element.removeEventListener("copy", handleCopy);
    },
  };
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the synchronous browser API below.
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  const previousActiveElement = document.activeElement;
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
  }
}
