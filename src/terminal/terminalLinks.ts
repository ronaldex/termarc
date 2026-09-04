import { openUrl } from "@tauri-apps/plugin-opener";
import type { IDisposable, ILink, IMarker } from "@xterm/xterm";
import { resolveTerminalPath, type TerminalPath } from "../api/paths";
import type { ShortcutModifier } from "../types/settings";
import type { InitializedTerminalTab } from "../types/terminal";

type PendingLink = {
  marker: IMarker;
  startX: number;
  uri: string;
};

type CapturedLink = PendingLink & {
  endLineOffset: number;
  endX: number;
};

const MAX_PENDING_PATH_RESOLUTIONS = 128;
const MAX_PENDING_PROVIDER_REQUESTS = 32;

export function installTerminalLinks(
  tab: InitializedTerminalTab,
  modifierPressed: () => boolean,
  activationModifierPressed: (event: MouseEvent) => boolean,
  openPath: (path: string) => Promise<void>,
): IDisposable {
  const capturedLinks: CapturedLink[] = [];
  const pendingPathResolutions = new Map<string, Promise<TerminalPath | null>>();
  let pendingLink: PendingLink | undefined;
  let pendingProviderRequests = 0;
  let disposed = false;

  function resolvePath(path: string): Promise<TerminalPath | null> {
    const key = `${tab.cwd}\0${path}`;
    const existing = pendingPathResolutions.get(key);
    if (existing) return existing;
    if (pendingPathResolutions.size >= MAX_PENDING_PATH_RESOLUTIONS) {
      return Promise.resolve(null);
    }

    const request = resolveTerminalPath(tab.cwd, path).catch(() => null);
    pendingPathResolutions.set(key, request);
    void request.then(() => {
      if (pendingPathResolutions.get(key) === request) pendingPathResolutions.delete(key);
    });
    return request;
  }

  // Handle OSC 8 ourselves. xterm renders OSC 8 links with a dotted underline
  // unconditionally, while Termarc only reveals links while the configured modifier is held.
  const oscHandler = tab.terminal.parser.registerOscHandler(8, (data) => {
    const separator = data.indexOf(";");
    const uri = separator >= 0 ? data.slice(separator + 1) : "";
    if (uri) {
      pendingLink?.marker.dispose();
      const marker = tab.terminal.registerMarker(0);
      pendingLink = {
        marker,
        startX: tab.terminal.buffer.active.cursorX + 1,
        uri,
      };
      marker.onDispose(() => {
        if (pendingLink?.marker === marker) pendingLink = undefined;
      });
    } else if (pendingLink) {
      const endLine = tab.terminal.buffer.active.baseY + tab.terminal.buffer.active.cursorY;
      const capturedLink = {
        marker: pendingLink.marker,
        startX: pendingLink.startX,
        endLineOffset: endLine - pendingLink.marker.line,
        endX: Math.max(1, tab.terminal.buffer.active.cursorX),
        uri: pendingLink.uri,
      };
      pendingLink = undefined;
      if (!capturedLink.marker.isDisposed) {
        capturedLinks.push(capturedLink);
        capturedLink.marker.onDispose(() => {
          const index = capturedLinks.indexOf(capturedLink);
          if (index >= 0) capturedLinks.splice(index, 1);
        });
      }
    }
    return true;
  });

  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  const pathPattern = /(?:~|\/|\.\.?\/)[^\s"'<>]+|(?:[\w@.+-]+\/)+(?:[\w@.+:-]+)?/g;
  const linkProvider = tab.terminal.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      if (!modifierPressed()) {
        callback(undefined);
        return;
      }

      const oscLinks = capturedLinks
        .filter((link) => {
          if (link.marker.isDisposed) return false;
          const line = lineNumber - 1;
          return line >= link.marker.line && line <= link.marker.line + link.endLineOffset;
        })
        .map((link): ILink => ({
          text: link.uri,
          range: {
            start: { x: link.startX, y: link.marker.line + 1 },
            end: {
              x: link.endX,
              y: link.marker.line + link.endLineOffset + 1,
            },
          },
          activate: (event) => {
            if (activationModifierPressed(event)) openTerminalUri(tab.cwd, link.uri, openPath);
          },
        }));
      const line = tab.terminal.buffer.active.getLine(lineNumber - 1)?.translateToString(true);
      if (!line) {
        callback(oscLinks.length ? oscLinks : undefined);
        return;
      }

      const webLinks = [...line.matchAll(urlPattern)].map((match): ILink | undefined => {
        const text = match[0].replace(/[),.;]+$/, "");
        if (match.index === undefined) return undefined;
        return {
          text,
          range: {
            start: { x: match.index + 1, y: lineNumber },
            end: { x: match.index + text.length, y: lineNumber },
          },
          activate: (event) => {
            if (activationModifierPressed(event)) openTerminalUri(tab.cwd, text, openPath);
          },
        };
      });
      const pathMatches = [...line.matchAll(pathPattern)].filter(
        (match) => !webLinks.some((link) => link && rangesOverlap(match, link)),
      );
      if (pendingProviderRequests >= MAX_PENDING_PROVIDER_REQUESTS) {
        callback([...oscLinks, ...webLinks].filter((link): link is ILink => link !== undefined));
        return;
      }

      pendingProviderRequests += 1;
      void Promise.all(
        pathMatches.map(async (match): Promise<ILink | undefined> => {
          const text = match[0].replace(/[),.;]+$/, "");
          const resolved = await resolvePath(text);
          if (!resolved || match.index === undefined) return undefined;
          return {
            text,
            range: {
              start: { x: match.index + 1, y: lineNumber },
              end: { x: match.index + text.length, y: lineNumber },
            },
            activate: (event) => {
              if (!activationModifierPressed(event)) return;
              void openPath(resolved.path).catch((error) =>
                console.error("Could not open terminal path", error),
              );
            },
          };
        }),
      )
        .then((pathLinks) => {
          if (disposed) return;
          const links = [...oscLinks, ...webLinks, ...pathLinks].filter(
            (link): link is ILink => link !== undefined,
          );
          callback(links.length ? links : undefined);
        })
        .finally(() => {
          pendingProviderRequests -= 1;
        });
    },
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      oscHandler.dispose();
      linkProvider.dispose();
      pendingLink?.marker.dispose();
      pendingLink = undefined;
      for (const link of [...capturedLinks]) link.marker.dispose();
      capturedLinks.length = 0;
      pendingPathResolutions.clear();
    },
  };
}

export function isTerminalLinkModifierPressed(
  event: Pick<MouseEvent, "ctrlKey" | "metaKey">,
  modifier: ShortcutModifier,
): boolean {
  return modifier === "ctrl" ? event.ctrlKey : event.metaKey;
}

function openTerminalUri(
  cwd: string,
  uri: string,
  openPath: (path: string) => Promise<void>,
): void {
  try {
    const url = new URL(uri);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void openUrl(url.href).catch((error) => console.error("Could not open terminal link", error));
    } else if (url.protocol === "file:") {
      // OSC 8 file links (including eza's) commonly include the local hostname.
      void resolveAndOpenPath(cwd, decodeURIComponent(url.pathname), openPath);
    }
  } catch {
    // Ignore malformed or unsupported links emitted by terminal applications.
  }
}

async function resolveAndOpenPath(
  cwd: string,
  path: string,
  openPath: (path: string) => Promise<void>,
): Promise<void> {
  const resolved = await resolveTerminalPath(cwd, path);
  if (resolved) await openPath(resolved.path);
}

function rangesOverlap(match: RegExpMatchArray, link: ILink): boolean {
  if (match.index === undefined) return false;
  const start = match.index + 1;
  const end = start + match[0].length - 1;
  return start <= link.range.end.x && end >= link.range.start.x;
}
