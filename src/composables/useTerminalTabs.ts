import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { computed, markRaw, nextTick, reactive, ref, watch } from "vue";
import { readClipboardText } from "../api/clipboard";
import { resizeTerminal, startTerminal, stopTerminal, writeTerminal } from "../api/terminals";
import {
  listenForAgentNotificationClicks,
  sendAgentReadyNotification,
} from "../services/agentNotifications";
import { createTerminalActivityMonitor } from "../services/terminalActivityMonitor";
import { applyAgentMarker } from "../utils/terminalActivity";
import { nextProjectTerminalId, projectTerminalIds } from "../utils/terminalTabs";
import { reorderProjectTerminalTabs, type DropPlacement } from "../utils/terminalOrdering";
import { createTerminalId } from "../utils/projectTerminals";
import {
  parseTerminalAgentMarker,
  parseTerminalShellMarker,
  TERMARC_AGENT_OSC,
} from "../utils/terminalAgentStatus";
import { createTerminal, prepareTerminalFonts } from "../terminal/createTerminal";
import { fitTerminalToContainer } from "../terminal/fitTerminal";
import { openPath } from "../services/externalEditor";
import { isTerminalLinkModifierPressed, installTerminalLinks } from "../terminal/terminalLinks";
import {
  copyTerminalSelection,
  installTerminalCopy,
  type TerminalCopyResult,
} from "../terminal/terminalCopy";
import { handleTerminalShortcut } from "../terminal/terminalShortcuts";
import { terminalTheme } from "../terminal/terminalThemes";
import { normalizeTerminalTitle, updateTerminalTitleOverride } from "../utils/terminalTitles";
import { useAppSettings } from "./useAppSettings";
import type { ExternalEditor } from "../types/settings";
import type { TerminalLaunch, TerminalStatus, TerminalTab } from "../types/terminal";

const MAX_PENDING_WRITE_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_WRITE_COUNT = 256;

export function useTerminalTabs(configuration: {
  isShortcutScopeActive?: () => boolean;
  externalEditorForProject: (projectId: string) => ExternalEditor;
  activateNumberedShortcut?: (number: number) => boolean;
  onCopy?: (result: Exclude<TerminalCopyResult, "empty">) => void;
}) {
  const { settings } = useAppSettings();
  const tabs = reactive<TerminalTab[]>([]);
  const activeTabId = ref<string>();
  const activeTab = computed(() => tabs.find((tab) => tab.id === activeTabId.value));
  const isEmpty = computed(() => tabs.length === 0);
  let terminalHost: HTMLElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame: number | undefined;
  let unlistenNotificationClick: (() => void) | undefined;
  let started = false;
  let disposed = false;
  let nextTabNumber = 1;
  let linkModifierPressed = false;
  let lastPointerPosition: { x: number; y: number } | undefined;
  let defaultProject = { projectId: "home", cwd: "~" };
  const activityMonitor = createTerminalActivityMonitor({ tabs });

  async function createTab(
    projectId: string,
    cwd: string,
    options: {
      id?: string;
      launch?: TerminalLaunch;
      launchTitle?: string;
      customTitle?: string;
      start?: boolean;
      activate?: boolean;
    } = {},
  ): Promise<TerminalTab | undefined> {
    if (disposed) return undefined;
    await prepareTerminalFonts();
    if (disposed) return undefined;

    const number = nextTabNumber++;
    const startImmediately = options.start !== false;
    const launch = options.launch ?? { kind: "shell" as const };
    let id = options.id?.trim() || createTerminalId();
    while (tabs.some((tab) => tab.id === id)) id = createTerminalId();
    const tab = reactive({
      id,
      number,
      shortcutNumber: number,
      title: `Terminal ${number}`,
      customTitle: normalizeTerminalTitle(options.customTitle ?? ""),
      launchTitle: normalizeTerminalTitle(options.launchTitle ?? ""),
      currentCwd: cwd,
      detail: startImmediately
        ? launch.kind === "command"
          ? "Starting command…"
          : "Starting shell…"
        : "Terminal stopped",
      projectId,
      cwd,
      launch,
      status: (startImmediately ? "starting" : "stopped") as TerminalStatus,
      terminal: markRaw(
        createTerminal({
          fontFamily: settings.terminalFontFamily,
          fontSize: settings.terminalFontSize,
          colorTheme: settings.colorTheme,
        }),
      ),
      fitAddon: markRaw(new FitAddon()),
      webglFailed: false,
      startGeneration: 0,
      stopRequested: false,
      writeQueue: Promise.resolve(),
      pendingWriteBytes: 0,
      pendingWriteCount: 0,
      disposed: false,
      restartAttempts: [],
    }) as TerminalTab;
    tabs.push(tab);
    if (options.activate !== false) activeTabId.value = tab.id;
    await nextTick();
    if (!tab.container || tab.disposed) return tab;
    tab.terminal.loadAddon(tab.fitAddon);
    tab.terminal.open(tab.container);
    tab.copyDisposable = markRaw(
      installTerminalCopy(tab.container, tab.terminal, (result) => configuration.onCopy?.(result)),
    );
    tab.linkDisposable = markRaw(
      installTerminalLinks(
        tab,
        () => linkModifierPressed,
        (event) => isTerminalLinkModifierPressed(event, settings.shortcutModifier),
        (path) => openPath(path, configuration.externalEditorForProject(tab.projectId)),
      ),
    );
    installTerminalTitle(tab);
    installTerminalAgentStatus(tab);
    installTerminalInput(tab);
    enableWebgl(tab);
    fitTab(tab);
    if (startImmediately) void startTab(tab);
    return tab;
  }

  function setTabShortcutOrder(orderedTabIds: readonly string[]): void {
    const rank = new Map(orderedTabIds.map((id, index) => [id, index]));
    const orderedTabs = [...tabs].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
    orderedTabs.forEach((tab, index) => {
      tab.shortcutNumber = index + 1;
    });
  }

  function reorderProjectTerminals(
    projectId: string,
    movedTabId: string,
    targetTabId: string,
    placement: DropPlacement,
  ): void {
    const orderedTabs = reorderProjectTerminalTabs(
      tabs,
      projectId,
      movedTabId,
      targetTabId,
      placement,
    );
    if (orderedTabs.every((tab, index) => tab === tabs[index])) return;
    tabs.splice(0, tabs.length, ...orderedTabs);
  }

  function setTerminalContainer(tab: TerminalTab, element: Element | null): void {
    tab.container = element instanceof HTMLDivElement ? element : undefined;
  }

  function installTerminalTitle(tab: TerminalTab): void {
    tab.terminal.onTitleChange((title) => {
      tab.terminalTitle = normalizeTerminalTitle(title);
      activityMonitor.trigger();
    });
  }

  function installTerminalAgentStatus(tab: TerminalTab): void {
    tab.terminal.parser.registerOscHandler(TERMARC_AGENT_OSC, (data) => {
      const agentMarker = parseTerminalAgentMarker(data);
      if (agentMarker) {
        const update = applyAgentMarker(tab, agentMarker);
        Object.assign(tab, update.activity);
        if (agentMarker.state === "processing") {
          tab.lastCommandExitCode = undefined;
          setTabStatus(tab, "running", "Agent processing");
        }
        if (update.becameReady) void notifyAgentReady(tab);
        return true;
      }
      const shellMarker = parseTerminalShellMarker(data);
      if (!shellMarker) return false;
      tab.lastCommandExitCode = shellMarker.exitCode;
      setTabStatus(
        tab,
        shellMarker.exitCode === 0 ? "running" : "error",
        shellMarker.exitCode === 0
          ? "Shell ready"
          : `Last command exited with status ${shellMarker.exitCode}`,
      );
      return true;
    });
  }

  async function notifyAgentReady(tab: TerminalTab): Promise<void> {
    if (!settings.notifyWhenAgentReady && !settings.playSoundWhenAgentReady) return;

    await sendAgentReadyNotification({
      tabId: tab.id,
      body: `Terminal ${tab.number} is waiting for input.`,
      notification: settings.notifyWhenAgentReady,
      sound: settings.playSoundWhenAgentReady,
    });
  }

  function installTerminalInput(tab: TerminalTab): void {
    tab.terminal.attachCustomKeyEventHandler((event) => {
      const modifierPressed = settings.shortcutModifier === "ctrl" ? event.ctrlKey : event.metaKey;
      const otherModifierPressed =
        settings.shortcutModifier === "ctrl" ? event.metaKey : event.ctrlKey;
      const isCommandArrow =
        event.type === "keydown" &&
        modifierPressed &&
        !event.shiftKey &&
        !event.altKey &&
        !otherModifierPressed &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight");
      if (isCommandArrow) {
        event.preventDefault();
        event.stopPropagation();
        // Match native macOS terminals: Cmd+Left/Right navigate to the line start/end.
        sendBytes(tab, new TextEncoder().encode(event.key === "ArrowLeft" ? "\x01" : "\x05"));
        return false;
      }

      // xterm.js 6.0 encodes Shift+Enter as Enter. Pi expects Kitty's CSI 13;2u.
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
    // Capture the requested tab instead of reading activeTab at callback time;
    // a subsequent selection change must not focus the wrong terminal.
    requestAnimationFrame(() => tabs.find((tab) => tab.id === id)?.terminal.focus());
  }

  function scheduleAutoRestart(tab: TerminalTab): void {
    if (tab.launch.kind !== "command" || !tab.launch.autoRestart || tab.stopRequested) return;
    const policy = tab.launch.autoRestart;
    const now = Date.now();
    tab.restartAttempts = tab.restartAttempts.filter(
      (attempt) => now - attempt <= policy.retryWindowSeconds * 1000,
    );
    if (tab.restartAttempts.length >= policy.maxRetries) {
      setTabStatus(tab, "error", `Auto-restart limit reached (${policy.maxRetries} retries)`);
      return;
    }
    tab.restartAttempts.push(now);
    tab.restartTimer = window.setTimeout(() => {
      tab.restartTimer = undefined;
      if (!tab.disposed && !tab.stopRequested) void startTab(tab);
    }, 1000);
  }

  function setTabStatus(tab: TerminalTab, status: TerminalStatus, detail: string): void {
    if (!tab.disposed) {
      tab.status = status;
      tab.detail = detail;
    }
  }

  function fitTab(tab: TerminalTab): void {
    if (tab.disposed || tab.id !== activeTabId.value) return;
    const fitted = fitTerminalToContainer(tab.container, tab.terminal, () => tab.fitAddon.fit());
    if (fitted && tab.session)
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

  function fitActiveTerminal(): void {
    if (activeTab.value) fitTab(activeTab.value);
  }

  async function fitActiveTerminalAfterLayout(): Promise<void> {
    // Explicit layout transitions can otherwise leave xterm one paint behind.
    await nextTick();
    fitActiveTerminal();
  }

  function fitHostResize(): void {
    // ResizeObserver runs after layout and before paint. Fit synchronously so
    // xterm's renderer cannot paint at the terminal host's previous width.
    if (resizeFrame !== undefined) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = undefined;
    }
    fitActiveTerminal();
  }

  function sendBytes(tab: TerminalTab, bytes: Uint8Array): void {
    const session = tab.session;
    if (!session || !bytes.length || tab.disposed) return;
    if (
      tab.pendingWriteCount >= MAX_PENDING_WRITE_COUNT ||
      tab.pendingWriteBytes + bytes.byteLength > MAX_PENDING_WRITE_BYTES
    ) {
      setTabStatus(tab, "error", "Terminal input buffer is full");
      return;
    }

    tab.pendingWriteCount += 1;
    tab.pendingWriteBytes += bytes.byteLength;
    tab.writeQueue = tab.writeQueue
      .then(() => {
        if (!tab.disposed && tab.session?.id === session.id) {
          return writeTerminal(session.id, bytes);
        }
      })
      .catch((error) => {
        console.error("PTY write failed", error);
        setTabStatus(tab, "error", String(error));
      })
      .finally(() => {
        tab.pendingWriteCount -= 1;
        tab.pendingWriteBytes -= bytes.byteLength;
      });
  }

  function setTerminalTitleOverride(id: string, title: string): void {
    const tab = tabs.find((item) => item.id === id);
    if (tab) updateTerminalTitleOverride(tab, title);
  }

  async function copyTerminal(id: string): Promise<TerminalCopyResult> {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return "empty";
    return copyTerminalSelection(tab.terminal);
  }

  async function pasteTerminal(id: string): Promise<"pasted" | "failed" | "empty"> {
    const tab = tabs.find((item) => item.id === id);
    if (!tab?.session || tab.status !== "running") return "failed";
    try {
      const text = await readClipboardText();
      if (!text) return "empty";
      tab.terminal.paste(text);
      tab.terminal.focus();
      return "pasted";
    } catch {
      return "failed";
    }
  }

  async function startTab(tab: TerminalTab): Promise<void> {
    const generation = ++tab.startGeneration;
    tab.session = undefined;
    tab.terminalTitle = undefined;
    tab.agent = undefined;
    tab.agentState = undefined;
    tab.terminalExitCode = undefined;
    tab.lastCommandExitCode = undefined;
    tab.stopRequested = false;
    const isCommand = tab.launch.kind === "command";
    let processExited = false;
    setTabStatus(tab, "starting", isCommand ? "Starting command…" : "Starting shell…");
    tab.terminal.reset();
    await nextTick();
    fitTab(tab);
    try {
      const started = await startTerminal({
        rows: tab.terminal.rows,
        cols: tab.terminal.cols,
        cwd: tab.cwd,
        launch:
          tab.launch.kind === "command"
            ? { kind: "command", command: tab.launch.commandLine }
            : { kind: "shell" },
        onOutput: (data) => {
          if (!tab.disposed && generation === tab.startGeneration)
            tab.terminal.write(new Uint8Array(data));
        },
        onEvent: (message) => {
          if (tab.disposed || generation !== tab.startGeneration) return;
          if (message.event === "exit") {
            processExited = true;
            const exitCode = message.exitCode ?? 0;
            if (isCommand) {
              tab.session = undefined;
              setTabStatus(
                tab,
                tab.stopRequested || exitCode === 0 ? "stopped" : "error",
                tab.stopRequested ? "Command stopped" : `Command exited with status ${exitCode}`,
              );
              if (!tab.stopRequested && exitCode !== 0) scheduleAutoRestart(tab);
            } else if (exitCode === 0) {
              void closeTab(tab.id);
            } else {
              tab.session = undefined;
              tab.terminalExitCode = exitCode;
              setTabStatus(tab, "error", `Process exited with status ${exitCode}`);
            }
          } else {
            processExited = true;
            tab.session = undefined;
            setTabStatus(tab, "error", message.message ?? "PTY error");
            if (isCommand && !tab.stopRequested) scheduleAutoRestart(tab);
          }
        },
      });
      if (tab.disposed || generation !== tab.startGeneration) {
        await stopTerminal(started.id).catch(() => undefined);
        return;
      }
      if (processExited) return;
      tab.session = started;
      setTabStatus(
        tab,
        "running",
        `${started.shell} · ${started.pid ? `PID ${started.pid}` : "running"}`,
      );
      void activityMonitor.refresh();
      if (tab.id === activeTabId.value) tab.terminal.focus();
    } catch (error) {
      if (tab.disposed || generation !== tab.startGeneration) return;
      setTabStatus(tab, "error", String(error));
      tab.terminal.write(`\r\n\x1b[31mFailed to start PTY: ${String(error)}\x1b[0m\r\n`);
      if (isCommand && !tab.stopRequested) scheduleAutoRestart(tab);
    }
  }

  async function stopTab(tab: TerminalTab): Promise<void> {
    const session = tab.session;
    tab.session = undefined;
    if (tab.restartTimer !== undefined) {
      window.clearTimeout(tab.restartTimer);
      tab.restartTimer = undefined;
    }
    tab.stopRequested = true;
    tab.startGeneration++;
    setTabStatus(tab, "stopped", "Stopping…");
    if (!session) {
      setTabStatus(tab, "stopped", "Command stopped");
      return;
    }
    try {
      await stopTerminal(session.id);
      setTabStatus(tab, "stopped", "Command stopped");
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
    const adjacentId = tabs[index + 1]?.id ?? tabs[index - 1]?.id;
    const nextId =
      tab.launch.kind === "shell" ? (nextProjectTerminalId(tabs, id) ?? adjacentId) : adjacentId;
    const wasActive = activeTabId.value === id;
    const session = tab.session;
    tab.disposed = true;
    if (tab.restartTimer !== undefined) window.clearTimeout(tab.restartTimer);
    tab.startGeneration++;
    tab.session = undefined;
    tab.linkDisposable?.dispose();
    tab.linkDisposable = undefined;
    tab.copyDisposable?.dispose();
    tab.copyDisposable = undefined;
    tab.terminal.dispose();
    tabs.splice(index, 1);
    if (session) void stopTerminal(session.id).catch(console.error);
    if (wasActive) activeTabId.value = nextId;
    await nextTick();
    scheduleFit();
    if (wasActive && nextId) {
      requestAnimationFrame(() => activeTab.value?.terminal.focus());
    }
  }

  function clearActiveTab(): void {
    activeTab.value?.terminal.clear();
    activeTab.value?.terminal.focus();
  }

  watch(activeTabId, scheduleFit, { flush: "post" });

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

  watch(
    () => settings.colorTheme,
    (theme) => {
      for (const tab of tabs) tab.terminal.options.theme = terminalTheme(theme);
    },
  );

  function setLinkModifierPressed(pressed: boolean): void {
    if (linkModifierPressed === pressed) return;
    linkModifierPressed = pressed;
    const position = lastPointerPosition;
    if (!position) return;
    document.elementFromPoint(position.x, position.y)?.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: position.x,
        clientY: position.y,
        ctrlKey: settings.shortcutModifier === "ctrl" && pressed,
        metaKey: settings.shortcutModifier === "meta" && pressed,
      }),
    );
  }

  function handleKeyboard(event: KeyboardEvent): void {
    if (configuration.isShortcutScopeActive?.()) return;
    const modifierPressed = settings.shortcutModifier === "ctrl" ? event.ctrlKey : event.metaKey;
    setLinkModifierPressed(modifierPressed);

    const terminal = activeTab.value?.terminal;
    const isCopyShortcut =
      isTerminalFocused() &&
      terminal?.hasSelection() &&
      event.key.toLowerCase() === "c" &&
      modifierPressed &&
      !event.altKey &&
      !event.isComposing &&
      !(settings.shortcutModifier === "ctrl" ? event.metaKey : event.ctrlKey) &&
      (settings.shortcutModifier === "ctrl" ? event.shiftKey : !event.shiftKey);
    if (isCopyShortcut && terminal) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void copyTerminalSelection(terminal).then((result) => {
        if (result !== "empty") configuration.onCopy?.(result);
      });
      return;
    }

    const otherModifierPressed =
      settings.shortcutModifier === "ctrl" ? event.metaKey : event.ctrlKey;
    const isNumberedShortcut =
      modifierPressed &&
      !event.shiftKey &&
      !event.altKey &&
      !otherModifierPressed &&
      /^[1-9]$/.test(event.key);
    if (isNumberedShortcut && configuration.activateNumberedShortcut?.(Number(event.key))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const handled = handleTerminalShortcut(event, {
      terminalFocused: isTerminalFocused(),
      tabIdsByNumber: configuration.activateNumberedShortcut
        ? new Map()
        : new Map(
            tabs.flatMap((tab) => {
              const shortcutNumber = tab.shortcutNumber ?? tab.number;
              return shortcutNumber <= 9 ? [[shortcutNumber, tab.id]] : [];
            }),
          ),
      orderedTabIds: projectTerminalIds(tabs, activeTab.value?.projectId),
      activeTabId: activeTabId.value,
      fontSize: settings.terminalFontSize,
      shortcutModifier: settings.shortcutModifier,
      selectTab,
      setFontSize: (fontSize) => {
        settings.terminalFontSize = fontSize;
      },
    });
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function handleKeyUp(event: KeyboardEvent): void {
    setLinkModifierPressed(settings.shortcutModifier === "ctrl" ? event.ctrlKey : event.metaKey);
  }
  function handlePointerMove(event: PointerEvent): void {
    lastPointerPosition = { x: event.clientX, y: event.clientY };
  }
  function handleWindowBlur(): void {
    setLinkModifierPressed(false);
  }
  function attachHost(host: HTMLElement): void {
    terminalHost?.removeEventListener("pointermove", handlePointerMove);
    terminalHost = host;
    terminalHost.addEventListener("pointermove", handlePointerMove);
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(fitHostResize);
    resizeObserver.observe(host);
  }
  function setDefaultProject(projectId: string, cwd: string): void {
    defaultProject = { projectId, cwd };
  }

  function isTerminalFocused(): boolean {
    return terminalHost?.contains(document.activeElement) ?? false;
  }
  function focusActiveTerminal(): void {
    activeTab.value?.terminal.focus();
  }
  function start(projectId: string, cwd: string): void {
    if (disposed || started) return;
    started = true;
    setDefaultProject(projectId, cwd);
    window.addEventListener("keydown", handleKeyboard, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleWindowBlur);
    void listenForAgentNotificationClicks((tabId) => {
      if (tabs.some((tab) => tab.id === tabId)) selectTab(tabId);
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenNotificationClick = unlisten;
      })
      .catch((error) => console.error("Could not listen for notification clicks", error));
    activityMonitor.start();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    activityMonitor.dispose();
    terminalHost?.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("keydown", handleKeyboard, { capture: true });
    window.removeEventListener("keyup", handleKeyUp, { capture: true });
    window.removeEventListener("blur", handleWindowBlur);
    unlistenNotificationClick?.();
    unlistenNotificationClick = undefined;
    for (const tab of tabs) {
      tab.disposed = true;
      tab.linkDisposable?.dispose();
      tab.linkDisposable = undefined;
      tab.copyDisposable?.dispose();
      tab.copyDisposable = undefined;
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
    startTab,
    selectTab,
    closeTab,
    copyTerminal,
    pasteTerminal,
    setTerminalTitleOverride,
    setTabShortcutOrder,
    reorderProjectTerminals,
    restartTab,
    stopTab,
    clearActiveTab,
    setTerminalContainer,
    attachHost,
    fitActiveTerminalAfterLayout,
    setDefaultProject,
    isTerminalFocused,
    focusActiveTerminal,
    start,
    dispose,
  };
}
