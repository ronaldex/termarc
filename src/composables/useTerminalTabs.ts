import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal, type ILink, type IMarker } from "@xterm/xterm";
import { computed, markRaw, nextTick, reactive, ref, watch } from "vue";
import { openTerminalPath, resolveTerminalPath } from "../api/paths";
import { resizeTerminal, startTerminal, stopTerminal, writeTerminal } from "../api/terminals";
import { useAppSettings } from "./useAppSettings";
import type { TerminalStatus, TerminalTab } from "../types/terminal";

type PendingLink = {
  marker: IMarker;
  startX: number;
  uri: string;
};

type CapturedLink = PendingLink & {
  endLineOffset: number;
  endX: number;
};

export function useTerminalTabs() {
  const { settings } = useAppSettings();
  const tabs = reactive<TerminalTab[]>([]);
  const activeTabId = ref<string>();
  const activeTab = computed(() => tabs.find((tab) => tab.id === activeTabId.value));
  const isEmpty = computed(() => tabs.length === 0);
  let terminalHost: HTMLElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame: number | undefined;
  let nextTabNumber = 1;
  let commandKeyPressed = false;
  let lastPointerPosition: { x: number; y: number } | undefined;
  let defaultProject = { projectId: "project-1", cwd: "." };

  function createTerminal(): Terminal {
    return new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      drawBoldTextInBrightColors: true,
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      fontWeight: "400",
      fontWeightBold: "600",
      lineHeight: 1.18,
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

  async function createTab(projectId: string, cwd: string): Promise<TerminalTab> {
    const number = nextTabNumber++;
    const tab = reactive({
      id: `terminal-${number}`,
      number,
      title: `Terminal ${number}`,
      detail: "Starting shell…",
      projectId,
      cwd,
      status: "starting" as TerminalStatus,
      terminal: markRaw(createTerminal()),
      fitAddon: markRaw(new FitAddon()),
      webglFailed: false,
      startGeneration: 0,
      writeQueue: Promise.resolve(),
      disposed: false,
    }) as TerminalTab;
    tabs.push(tab);
    activeTabId.value = tab.id;
    await nextTick();
    if (!tab.container || tab.disposed) return tab;
    tab.terminal.loadAddon(tab.fitAddon);
    tab.terminal.open(tab.container);
    installTerminalLinks(tab);
    installTerminalInput(tab);
    enableWebgl(tab);
    fitTab(tab);
    void startTab(tab);
    return tab;
  }

  function setTerminalContainer(tab: TerminalTab, element: Element | null): void {
    tab.container = element instanceof HTMLDivElement ? element : undefined;
  }

  function openTerminalUri(cwd: string, uri: string): void {
    try {
      const url = new URL(uri);
      if (url.protocol === "http:" || url.protocol === "https:") {
        void openUrl(url.href).catch((error) =>
          console.error("Could not open terminal link", error),
        );
      } else if (url.protocol === "file:") {
        // OSC 8 file links (including eza's) commonly include the local hostname.
        void resolveAndOpenPath(cwd, decodeURIComponent(url.pathname));
      }
    } catch {
      // Ignore malformed or unsupported links emitted by terminal applications.
    }
  }

  function installTerminalLinks(tab: TerminalTab): void {
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
        if (!commandKeyPressed) {
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

  async function resolveAndOpenPath(cwd: string, path: string): Promise<void> {
    const resolved = await resolveTerminalPath(cwd, path);
    if (resolved) await openTerminalPath(resolved.path);
  }

  function installTerminalInput(tab: TerminalTab): void {
    // xterm.js 6.0 encodes Shift+Enter as Enter. Pi expects Kitty's CSI 13;2u.
    tab.terminal.attachCustomKeyEventHandler((event) => {
      const isShiftEnter =
        event.type === "keydown" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing;
      if (!isShiftEnter) return true;
      event.preventDefault();
      event.stopPropagation();
      sendBytes(tab, new TextEncoder().encode("\x1b[13;2u"));
      return false;
    });
    tab.terminal.onData((data) => sendBytes(tab, new TextEncoder().encode(data)));
    tab.terminal.onBinary((data) =>
      sendBytes(
        tab,
        Uint8Array.from(data, (char) => char.charCodeAt(0)),
      ),
    );
    tab.terminal.onResize(({ cols, rows }) => {
      if (tab.id === activeTabId.value && tab.session) {
        void resizeTerminal(tab.session.id, rows, cols).catch(console.error);
      }
    });
  }

  function enableWebgl(tab: TerminalTab): void {
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
        tab.webglAddon = undefined;
        tab.webglFailed = true;
      });
      tab.terminal.loadAddon(addon);
      tab.webglAddon = addon;
    } catch (error) {
      console.warn("WebGL renderer unavailable; using xterm's default renderer", error);
      tab.webglFailed = true;
    }
  }

  function selectTab(id: string): void {
    activeTabId.value = id;
    scheduleFit();
    requestAnimationFrame(() => activeTab.value?.terminal.focus());
  }

  function setTabStatus(tab: TerminalTab, status: TerminalStatus, detail: string): void {
    if (!tab.disposed) {
      tab.status = status;
      tab.detail = detail;
    }
  }

  function fitTab(tab: TerminalTab): void {
    if (tab.disposed || tab.id !== activeTabId.value) return;
    tab.fitAddon.fit();
    if (tab.session)
      void resizeTerminal(tab.session.id, tab.terminal.rows, tab.terminal.cols).catch(
        console.error,
      );
  }

  function scheduleFit(): void {
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (activeTab.value) fitTab(activeTab.value);
    });
  }

  function sendBytes(tab: TerminalTab, bytes: Uint8Array): void {
    const session = tab.session;
    if (!session || !bytes.length || tab.disposed) return;
    tab.writeQueue = tab.writeQueue
      .then(() => writeTerminal(session.id, bytes))
      .catch((error) => {
        console.error("PTY write failed", error);
        setTabStatus(tab, "error", String(error));
      });
  }

  async function startTab(tab: TerminalTab): Promise<void> {
    const generation = ++tab.startGeneration;
    tab.session = undefined;
    setTabStatus(tab, "starting", "Starting shell…");
    tab.terminal.reset();
    fitTab(tab);
    try {
      const started = await startTerminal({
        rows: tab.terminal.rows,
        cols: tab.terminal.cols,
        cwd: tab.cwd,
        onOutput: (data) => {
          if (!tab.disposed && generation === tab.startGeneration)
            tab.terminal.write(new Uint8Array(data));
        },
        onEvent: (message) => {
          if (tab.disposed || generation !== tab.startGeneration) return;
          if (message.event === "exit") {
            if ((message.exitCode ?? 0) === 0) void closeTab(tab.id);
          } else setTabStatus(tab, "error", message.message ?? "PTY error");
        },
      });
      if (tab.disposed || generation !== tab.startGeneration) {
        await stopTerminal(started.id);
        return;
      }
      tab.session = started;
      setTabStatus(
        tab,
        "running",
        `${started.shell} · ${started.pid ? `PID ${started.pid}` : "running"}`,
      );
      if (tab.id === activeTabId.value) tab.terminal.focus();
    } catch (error) {
      setTabStatus(tab, "error", String(error));
      tab.terminal.write(`\r\n\x1b[31mFailed to start PTY: ${String(error)}\x1b[0m\r\n`);
    }
  }

  async function stopTab(tab: TerminalTab): Promise<void> {
    const session = tab.session;
    if (!session) return;
    tab.session = undefined;
    setTabStatus(tab, "stopped", "Stopping…");
    try {
      await stopTerminal(session.id);
    } catch (error) {
      setTabStatus(tab, "error", String(error));
    }
  }

  async function restartTab(tab: TerminalTab): Promise<void> {
    await stopTab(tab);
    if (!tab.disposed) await startTab(tab);
  }

  async function closeTab(id: string): Promise<void> {
    const index = tabs.findIndex((tab) => tab.id === id);
    const tab = tabs[index];
    if (!tab) return;
    const nextId = tabs[index + 1]?.id ?? tabs[index - 1]?.id;
    const session = tab.session;
    tab.disposed = true;
    tab.startGeneration++;
    tab.session = undefined;
    tab.terminal.dispose();
    tabs.splice(index, 1);
    if (session) void stopTerminal(session.id).catch(console.error);
    if (activeTabId.value === id) activeTabId.value = nextId;
    await nextTick();
    scheduleFit();
  }

  function clearActiveTab(): void {
    activeTab.value?.terminal.clear();
    activeTab.value?.terminal.focus();
  }

  watch(
    () => settings.terminalFontFamily,
    (fontFamily) => {
      for (const tab of tabs) tab.terminal.options.fontFamily = fontFamily;
      scheduleFit();
    },
  );

  watch(
    () => settings.terminalFontSize,
    (fontSize) => {
      for (const tab of tabs) tab.terminal.options.fontSize = fontSize;
      scheduleFit();
    },
  );

  function setCommandKeyPressed(pressed: boolean): void {
    if (commandKeyPressed === pressed) return;
    commandKeyPressed = pressed;
    const position = lastPointerPosition;
    if (!position) return;
    document.elementFromPoint(position.x, position.y)?.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: position.x,
        clientY: position.y,
        metaKey: pressed,
      }),
    );
  }

  function handleKeyboard(event: KeyboardEvent): void {
    setCommandKeyPressed(event.metaKey);
    const shortcut = event.metaKey || (event.ctrlKey && event.shiftKey);
    if (!shortcut) return;
    if (/^[1-9]$/.test(event.key)) {
      const tab = tabs.find((item) => item.number === Number(event.key));
      if (tab) {
        event.preventDefault();
        selectTab(tab.id);
      }
      return;
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      void createTab(defaultProject.projectId, defaultProject.cwd);
    }
    if (event.key.toLowerCase() === "w" && activeTab.value) {
      event.preventDefault();
      void closeTab(activeTab.value.id);
    }
  }
  function handleKeyUp(event: KeyboardEvent): void {
    setCommandKeyPressed(event.metaKey);
  }
  function handlePointerMove(event: PointerEvent): void {
    lastPointerPosition = { x: event.clientX, y: event.clientY };
  }
  function handleWindowBlur(): void {
    setCommandKeyPressed(false);
  }
  function attachHost(host: HTMLElement): void {
    terminalHost?.removeEventListener("pointermove", handlePointerMove);
    terminalHost = host;
    terminalHost.addEventListener("pointermove", handlePointerMove);
    resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(host);
  }
  function setDefaultProject(projectId: string, cwd: string): void {
    defaultProject = { projectId, cwd };
  }
  function start(projectId: string, cwd: string): void {
    setDefaultProject(projectId, cwd);
    window.addEventListener("keydown", handleKeyboard, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleWindowBlur);
    document.fonts.ready.then(scheduleFit).catch(console.error);
    void createTab(projectId, cwd);
  }
  function dispose(): void {
    resizeObserver?.disconnect();
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    terminalHost?.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("keydown", handleKeyboard, { capture: true });
    window.removeEventListener("keyup", handleKeyUp, { capture: true });
    window.removeEventListener("blur", handleWindowBlur);
    for (const tab of tabs) {
      tab.disposed = true;
      tab.terminal.dispose();
      if (tab.session) void stopTerminal(tab.session.id);
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    isEmpty,
    createTab,
    selectTab,
    closeTab,
    restartTab,
    stopTab,
    clearActiveTab,
    setTerminalContainer,
    attachHost,
    setDefaultProject,
    start,
    dispose,
  };
}

function rangesOverlap(match: RegExpMatchArray, link: ILink): boolean {
  if (match.index === undefined) return false;
  const start = match.index + 1;
  const end = start + match[0].length - 1;
  return start <= link.range.end.x && end >= link.range.start.x;
}
