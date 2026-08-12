import type { ShortcutModifier } from "../types/settings";

export function isMacOS(): boolean {
  return /Macintosh|Mac OS X/.test(navigator.userAgent) || navigator.platform === "MacIntel";
}

export function isLinux(): boolean {
  return /Linux/.test(navigator.userAgent) || /Linux/.test(navigator.platform);
}

export function defaultShortcutModifier(): ShortcutModifier {
  return isMacOS() ? "meta" : "ctrl";
}
