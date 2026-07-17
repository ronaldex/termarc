import { openUrl } from "@tauri-apps/plugin-opener";
import type { ILink, IMarker } from "@xterm/xterm";
import { openTerminalPath, resolveTerminalPath } from "../api/paths";
import type { TerminalTab } from "../types/terminal";

type PendingLink = {
  marker: IMarker;
  startX: number;
  uri: string;
};

type CapturedLink = PendingLink & {
  endLineOffset: number;
  endX: number;
};

export function installTerminalLinks(tab: TerminalTab, commandKeyPressed: () => boolean): void {
  const capturedLinks: CapturedLink[] = [];
  let pendingLink: PendingLink | undefined;

  // Handle OSC 8 ourselves. xterm renders OSC 8 links with a dotted underline
  // unconditionally, while Termdeck only reveals links while Command is held.
  tab.terminal.parser.registerOscHandler(8, (data) => {
    const separator = data.indexOf(";");
    const uri = separator >= 0 ? data.slice(separator + 1) : "";
    if (uri) {
      pendingLink?.marker.dispose();
      pendingLink = {
        marker: tab.terminal.registerMarker(0),
        startX: tab.terminal.buffer.active.cursorX + 1,
        uri,
      };
    } else if (pendingLink) {
      const endLine = tab.terminal.buffer.active.baseY + tab.terminal.buffer.active.cursorY;
      capturedLinks.push({
        marker: pendingLink.marker,
        startX: pendingLink.startX,
        endLineOffset: endLine - pendingLink.marker.line,
        endX: Math.max(1, tab.terminal.buffer.active.cursorX),
        uri: pendingLink.uri,
      });
      pendingLink = undefined;
    }
    return true;
  });

  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  const pathPattern = /(?:~|\/|\.\.?\/)[^\s"'<>]+|(?:[\w@.+-]+\/)+(?:[\w@.+:-]+)?/g;
  tab.terminal.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      if (!commandKeyPressed()) {
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
            if (event.metaKey) openTerminalUri(tab.cwd, link.uri);
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
            if (event.metaKey) openTerminalUri(tab.cwd, text);
          },
        };
      });
      const pathMatches = [...line.matchAll(pathPattern)].filter(
        (match) => !webLinks.some((link) => link && rangesOverlap(match, link)),
      );
      void Promise.all(
        pathMatches.map(async (match): Promise<ILink | undefined> => {
          const text = match[0].replace(/[),.;]+$/, "");
          const resolved = await resolveTerminalPath(tab.cwd, text).catch(() => null);
          if (!resolved || match.index === undefined) return undefined;
          return {
            text,
            range: {
              start: { x: match.index + 1, y: lineNumber },
              end: { x: match.index + text.length, y: lineNumber },
            },
            activate: (event) => {
              if (!event.metaKey) return;
              void openTerminalPath(resolved.path).catch((error) =>
                console.error("Could not open terminal path", error),
              );
            },
          };
        }),
      ).then((pathLinks) => {
        const links = [...oscLinks, ...webLinks, ...pathLinks].filter(
          (link): link is ILink => link !== undefined,
        );
        callback(links.length ? links : undefined);
      });
    },
  });
}

function openTerminalUri(cwd: string, uri: string): void {
  try {
    const url = new URL(uri);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void openUrl(url.href).catch((error) => console.error("Could not open terminal link", error));
    } else if (url.protocol === "file:") {
      // OSC 8 file links (including eza's) commonly include the local hostname.
      void resolveAndOpenPath(cwd, decodeURIComponent(url.pathname));
    }
  } catch {
    // Ignore malformed or unsupported links emitted by terminal applications.
  }
}

async function resolveAndOpenPath(cwd: string, path: string): Promise<void> {
  const resolved = await resolveTerminalPath(cwd, path);
  if (resolved) await openTerminalPath(resolved.path);
}

function rangesOverlap(match: RegExpMatchArray, link: ILink): boolean {
  if (match.index === undefined) return false;
  const start = match.index + 1;
  const end = start + match[0].length - 1;
  return start <= link.range.end.x && end >= link.range.start.x;
}
