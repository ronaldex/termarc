import { afterEach, describe, expect, it, vi } from "vitest";
import type { PtyStatus, TerminalTab } from "../types/terminal";
import { createTerminalActivityMonitor } from "./terminalActivityMonitor";

function tabs(): TerminalTab[] {
  return [
    {
      id: "terminal-1",
      session: { id: "pty-1", shell: "/bin/zsh" },
      disposed: false,
      cwd: "/workspace",
      currentCwd: "/workspace",
    } as TerminalTab,
  ];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("terminal activity monitor", () => {
  it("applies a batched process snapshot to the requested session", async () => {
    const subject = tabs();
    const monitor = createTerminalActivityMonitor({
      tabs: subject,
      loadStatuses: async () => ({
        "pty-1": { processName: "node", cwd: "/workspace/app" },
      }),
    });

    await monitor.refresh();

    expect(subject[0]).toMatchObject({ processName: "node", currentCwd: "/workspace/app" });
  });

  it("clears the previous command error when a new process starts", async () => {
    const subject = tabs();
    Object.assign(subject[0]!, {
      status: "error",
      detail: "Last command exited with status 2",
      lastCommandExitCode: 2,
    });
    const monitor = createTerminalActivityMonitor({
      tabs: subject,
      loadStatuses: async () => ({ "pty-1": { processName: "node" } }),
    });

    await monitor.refresh();

    expect(subject[0]).toMatchObject({
      status: "running",
      detail: "node running",
      lastCommandExitCode: undefined,
    });
  });

  it("does not apply a snapshot after the tab session changes", async () => {
    let resolve!: (statuses: Record<string, PtyStatus>) => void;
    const response = new Promise<Record<string, PtyStatus>>((done) => {
      resolve = done;
    });
    const subject = tabs();
    const monitor = createTerminalActivityMonitor({
      tabs: subject,
      loadStatuses: () => response,
    });

    const refresh = monitor.refresh();
    subject[0]!.session = { id: "pty-2", shell: "/bin/zsh" };
    resolve({ "pty-1": { processName: "node" } });
    await refresh;

    expect(subject[0]!.processName).toBeUndefined();
  });

  it("debounces title-triggered refreshes", async () => {
    vi.useFakeTimers();
    const loadStatuses = vi.fn(async () => ({}));
    const monitor = createTerminalActivityMonitor({
      tabs: tabs(),
      loadStatuses,
      triggerDelayMs: 50,
    });

    monitor.trigger();
    monitor.trigger();
    await vi.advanceTimersByTimeAsync(49);
    expect(loadStatuses).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(loadStatuses).toHaveBeenCalledOnce();
    monitor.dispose();
  });

  it("queues one follow-up when a refresh is already pending", async () => {
    let resolve!: (statuses: Record<string, PtyStatus>) => void;
    const firstResponse = new Promise<Record<string, PtyStatus>>((done) => {
      resolve = done;
    });
    const loadStatuses = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({});
    const monitor = createTerminalActivityMonitor({ tabs: tabs(), loadStatuses });

    const first = monitor.refresh();
    await monitor.refresh();
    resolve({});
    await first;

    expect(loadStatuses).toHaveBeenCalledTimes(2);
  });
});
