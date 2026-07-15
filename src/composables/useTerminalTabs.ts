import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { computed, markRaw, nextTick, reactive, ref } from "vue";
import { resizeTerminal, startTerminal, stopTerminal, writeTerminal } from "../api/terminals";
import type { TerminalStatus, TerminalTab } from "../types/terminal";

export function useTerminalTabs() {
  const tabs = reactive<TerminalTab[]>([]);
  const activeTabId = ref<string>();
  const activeTab = computed(() => tabs.find((tab) => tab.id === activeTabId.value));
  const isEmpty = computed(() => tabs.length === 0);
  let terminalHost: HTMLElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame: number | undefined;
  let nextTabNumber = 1;
  let defaultProject = { projectId: "project-1", cwd: "." };

  function createTerminal(): Terminal {
    return new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      drawBoldTextInBrightColors: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
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
    installTerminalInput(tab);
    enableWebgl(tab);
    fitTab(tab);
    void startTab(tab);
    return tab;
  }

  function setTerminalContainer(tab: TerminalTab, element: Element | null): void {
    tab.container = element instanceof HTMLDivElement ? element : undefined;
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
  function statusLabel(tab: TerminalTab): string {
    if (tab.status === "running") return tab.session ? shellName(tab.session.shell) : "Running";
    if (tab.status === "starting") return "Starting…";
    return tab.status === "error" ? "Exited with error" : "Stopped";
  }
  function shellName(shell: string): string {
    return shell.split(/[\\/]/).pop() || shell;
  }
  function handleKeyboard(event: KeyboardEvent): void {
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
  function attachHost(host: HTMLElement): void {
    terminalHost = host;
    resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(host);
  }
  function setDefaultProject(projectId: string, cwd: string): void {
    defaultProject = { projectId, cwd };
  }
  function start(projectId: string, cwd: string): void {
    setDefaultProject(projectId, cwd);
    window.addEventListener("keydown", handleKeyboard, { capture: true });
    document.fonts.ready.then(scheduleFit).catch(console.error);
    void createTab(projectId, cwd);
  }
  function dispose(): void {
    resizeObserver?.disconnect();
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    window.removeEventListener("keydown", handleKeyboard, { capture: true });
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
    statusLabel,
    setTerminalContainer,
    attachHost,
    setDefaultProject,
    start,
    dispose,
  };
}
