// @vitest-environment happy-dom

import { effectScope, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../extensions/pi/fixtures/subagent-spawn-ipc.json";
import type { PtyEvent, PtyStarted, TerminalTab } from "../types/terminal";

const native = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: any }) => void>(),
  calls: [] as Array<{ command: string; payload?: Record<string, unknown> }>,
  mode: "running" as "running" | "early-error" | "ack-rollback",
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, listener: (event: { payload: any }) => void) => {
    native.listeners.set(event, listener);
    return native.unlisten;
  }),
}));

vi.mock("@tauri-apps/api/core", () => {
  class Channel<T> {
    onmessage?: (message: T) => void;
  }
  return {
    Channel,
    invoke: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      native.calls.push({ command, payload });
      if (command === "start_pty") {
        const event = payload?.onEvent as Channel<PtyEvent>;
        if (native.mode === "early-error")
          event.onmessage?.({ event: "error", message: "reader setup failed" });
        return { id: "pty-fixture", pid: 42, shell: "/bin/zsh" } satisfies PtyStarted;
      }
      if (command === "acknowledge_subagent_spawn" && native.mode === "ack-rollback")
        throw new Error("unknown subagent: reservation timed out");
      if (command === "get_pty_statuses") return {};
      return undefined;
    }),
  };
});

import { createSubagentSpawnService, SUBAGENT_SPAWN_EVENT } from "./subagentSpawns";
import { useTerminalTabs } from "../composables/useTerminalTabs";

function disposable() {
  return { dispose: vi.fn() };
}

function fakeTerminal(): TerminalTab["terminal"] {
  const terminal = {
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
    hasSelection: () => false,
    onTitleChange: () => disposable(),
    attachCustomKeyEventHandler: vi.fn(),
    onData: () => disposable(),
    onBinary: () => disposable(),
    onResize: () => disposable(),
    registerMarker: () => undefined,
    registerLinkProvider: () => disposable(),
  };
  return terminal as unknown as TerminalTab["terminal"];
}

async function setup(mode: typeof native.mode) {
  native.mode = mode;
  const scope = effectScope();
  const facade = scope.run(() =>
    useTerminalTabs({
      externalEditorForProject: () => "vscodium",
      prepareFonts: async () => undefined,
      createTerminal: fakeTerminal,
    }),
  )!;
  const parent = await facade.createTab(fixture.event.projectId, fixture.event.cwd, {
    id: fixture.event.parentTerminalId,
    start: false,
  });
  expect(parent).toBeDefined();
  const service = createSubagentSpawnService({
    createTab: facade.createTab,
    startTab: facade.startTab,
    closeTab: facade.closeTab,
  });
  service.update(facade.tabs);
  await service.start();
  await nextTick();
  native.listeners.get(SUBAGENT_SPAWN_EVENT)!({ payload: fixture.event });
  return { facade, service, scope };
}

function call(command: string) {
  return native.calls.find((candidate) => candidate.command === command);
}

beforeEach(() => {
  native.listeners.clear();
  native.calls.length = 0;
  native.mode = "running";
  native.unlisten.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subagent spawn PTY ownership integration", () => {
  it("crosses event service, useTerminalTabs typed start, terminal API, and acknowledgement", async () => {
    const { facade, service, scope } = await setup("running");
    await vi.waitFor(() => expect(call("acknowledge_subagent_spawn")).toBeDefined());

    expect(SUBAGENT_SPAWN_EVENT).toBe(fixture.eventName);
    const start = call("start_pty")!.payload!.request as Record<string, unknown>;
    expect(start).toMatchObject({
      cwd: fixture.startPtyRequest.cwd,
      launch: fixture.startPtyRequest.launch,
      subagent: fixture.startPtyRequest.subagent,
    });
    expect(start.terminalId).toBe(facade.tabs.find((tab) => tab.launch.kind === "subagent")?.id);
    expect(call("acknowledge_subagent_spawn")!.payload).toEqual({
      acknowledgement: fixture.acknowledgement,
    });
    expect(facade.tabs.find((tab) => tab.launch.kind === "subagent")?.status).toBe("running");

    service.dispose();
    facade.dispose();
    scope.stop();
  });

  it("rolls back a tab when an early PTY event wins before invoke resolves", async () => {
    const { facade, service, scope } = await setup("early-error");
    await vi.waitFor(() => expect(call("acknowledge_subagent_spawn")).toBeDefined());

    expect(call("acknowledge_subagent_spawn")!.payload).toEqual({
      acknowledgement: {
        subagentId: fixture.event.subagentId,
        success: false,
        error: "reader setup failed",
      },
    });
    expect(facade.tabs.some((tab) => tab.launch.kind === "subagent")).toBe(false);

    service.dispose();
    facade.dispose();
    scope.stop();
  });

  it("stops and removes an attached PTY when acknowledgement observes backend timeout rollback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { facade, service, scope } = await setup("ack-rollback");
    await vi.waitFor(() => expect(call("stop_pty")).toBeDefined());

    expect(call("stop_pty")!.payload).toEqual({ id: "pty-fixture" });
    expect(facade.tabs.some((tab) => tab.launch.kind === "subagent")).toBe(false);

    service.dispose();
    facade.dispose();
    scope.stop();
    consoleError.mockRestore();
  });
});
