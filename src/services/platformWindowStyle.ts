import { isMacOS } from "../utils/platform";

const MAC_WINDOW_STYLE = { cornerRadius: 14, offsetX: -8, offsetY: -9 };

/** Loads the AppKit-backed window decoration plugin only on macOS. */
export function configurePlatformWindowStyle(): void {
  if (!isMacOS()) return;

  void import("@cloudworxx/tauri-plugin-mac-rounded-corners")
    .then(({ enableModernWindowStyle }) => enableModernWindowStyle(MAC_WINDOW_STYLE))
    .catch((error: unknown) => console.error("Could not configure macOS window style", error));
}
