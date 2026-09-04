// @vitest-environment happy-dom

import { effectScope, nextTick, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalTab } from "../types/terminal";

const mocks = vi.hoisted(() => ({
  startTerminal: vi.fn(async () => ({ id: "pty-1", pid: 42, shell: "/bin/zsh" })),
  stopTerminal: vi.fn(async () => undefined),
  fit: vi.fn(),
  webglDispose: vi.fn(),
}));

vi.mock("../api/terminals", () => ({
  resizeTerminal: vi.fn(async () => undefined),
  startTerminal: mocks.startTerminal,
  stopTerminal: mocks.stopTerminal,
  writeTerminal: vi.fn(async () => undefined),
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = mocks.fit;
  },
}));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    onContextLoss() {}
    dispose = mocks.webglDispose;
  },
}));
vi.mock("../services/agentNotifications", () => ({
  listenForAgentNotificationClicks: vi.fn(async () => () => undefined),
  sendAgentReadyNotification: vi.fn(async () => undefined),
}));
vi.mock("../services/terminalActivityMonitor", () => ({
  createTerminalActivityMonitor: () => ({
    start: vi.fn(),
    trigger: vi.fn(),
    refresh: vi.fn(async () => undefined),
    dispose: vi.fn(),
  }),
}));

import { useTerminalTabs } from "./useTerminalTabs";

function disposable() {
  return { dispose: vi.fn() };
}

function fakeTerminal(): NonNullable<TerminalTab["terminal"]> {
  return {
    rows: 24,
    cols: 80,
    options: {},
    buffer: {
      active: { cursorX: 0, cursorY: 0, baseY: 0, viewportY: 0, getLine: () => undefined },
    },
    parser: { registerOscHandler: () => disposable() },
    loadAddon: vi.fn(),
    open: vi.fn(),
    focus: vi.fn(),
    reset: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn(),
    paste: vi.fn(),
    hasSelection: () => false,
    onTitleChange: () => disposable(),
    attachCustomKeyEventHandler: vi.fn(),
    onData: () => disposable(),
    onBinary: () => disposable(),
    onResize: () => disposable(),
    registerMarker: () => undefined,
    registerLinkProvider: () => disposable(),
    scrollToBottom: vi.fn(),
  } as unknown as NonNullable<TerminalTab["terminal"]>;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  mocks.startTerminal.mockClear();
  mocks.stopTerminal.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("useTerminalTabs startup restoration", () => {
  it("restores descriptors in one effect without creating stopped terminal runtimes", async () => {
    const prepareFonts = vi.fn(async () => undefined);
    const terminalFactory = vi.fn(fakeTerminal);
    const scope = effectScope();
    const facade = scope.run(() =>
      useTerminalTabs({
        externalEditorForProject: () => "vscodium",
        prepareFonts,
        createTerminal: terminalFactory,
      }),
    )!;
    const effects = vi.fn();
    watch(() => facade.tabs.length, effects);

    const restored = facade.restoreTabs([
      { projectId: "project-1", cwd: "/tmp/project", id: "parent" },
      {
        projectId: "project-1",
        cwd: "/tmp/project/child",
        id: "child",
        parentTerminalId: "parent",
      },
    ]);
    await nextTick();

    expect(restored.map((tab) => [tab.id, tab.parentTerminalId])).toEqual([
      ["parent", undefined],
      ["child", "parent"],
    ]);
    expect(effects).toHaveBeenCalledTimes(1);
    expect(prepareFonts).not.toHaveBeenCalled();
    expect(terminalFactory).not.toHaveBeenCalled();

    const target = document.createElement("div");
    document.body.append(target);
    facade.terminalContainerRef(restored[0]!, "test")(target);
    await nextTick();
    expect(terminalFactory).not.toHaveBeenCalled();

    facade.dispose();
    scope.stop();
  });

  it("cancels superseded starts while lazy runtime initialization is pending", async () => {
    let releaseFonts!: () => void;
    const prepareFonts = vi.fn(() => new Promise<void>((resolve) => (releaseFonts = resolve)));
    const terminalFactory = vi.fn(fakeTerminal);
    const scope = effectScope();
    const facade = scope.run(() =>
      useTerminalTabs({
        externalEditorForProject: () => "vscodium",
        prepareFonts,
        createTerminal: terminalFactory,
      }),
    )!;
    const tab = facade.restoreTabs([
      { projectId: "project-1", cwd: "/tmp/project", id: "terminal-1" },
    ])[0]!;

    const first = facade.startTab(tab);
    const second = facade.startTab(tab);
    expect(tab.status).toBe("starting");
    releaseFonts();

    await expect(first).resolves.toEqual({ outcome: "cancelled" });
    await expect(second).resolves.toMatchObject({ outcome: "running" });
    expect(mocks.startTerminal).toHaveBeenCalledTimes(1);

    facade.dispose();
    scope.stop();
  });

  it("cancels a start stopped during lazy runtime initialization", async () => {
    let releaseFonts!: () => void;
    const prepareFonts = vi.fn(() => new Promise<void>((resolve) => (releaseFonts = resolve)));
    const scope = effectScope();
    const facade = scope.run(() =>
      useTerminalTabs({
        externalEditorForProject: () => "vscodium",
        prepareFonts,
        createTerminal: fakeTerminal,
      }),
    )!;
    const tab = facade.restoreTabs([
      { projectId: "project-1", cwd: "/tmp/project", id: "terminal-1" },
    ])[0]!;

    const pendingStart = facade.startTab(tab);
    await facade.stopTab(tab);
    releaseFonts();

    await expect(pendingStart).resolves.toEqual({ outcome: "cancelled" });
    expect(tab.status).toBe("stopped");
    expect(mocks.startTerminal).not.toHaveBeenCalled();

    facade.dispose();
    scope.stop();
  });

  it("initializes a restored runtime on start and reuses font preparation", async () => {
    const prepareFonts = vi.fn(async () => undefined);
    const terminalFactory = vi.fn(fakeTerminal);
    const scope = effectScope();
    const facade = scope.run(() =>
      useTerminalTabs({
        externalEditorForProject: () => "vscodium",
        prepareFonts,
        createTerminal: terminalFactory,
      }),
    )!;
    const tab = facade.restoreTabs([
      { projectId: "project-1", cwd: "/tmp/project", id: "terminal-1" },
    ])[0]!;

    await facade.startTab(tab);
    await facade.restartTab(tab);

    expect(prepareFonts).toHaveBeenCalledTimes(1);
    expect(terminalFactory).toHaveBeenCalledTimes(1);
    expect(mocks.startTerminal).toHaveBeenCalledTimes(2);
    expect(tab.terminal).toBeDefined();

    facade.dispose();
    scope.stop();
  });
});
