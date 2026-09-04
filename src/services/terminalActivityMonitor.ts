import { getTerminalStatuses } from "../api/terminals";
import type { PtyStatus, TerminalTab } from "../types/terminal";
import { applyProcessSnapshot } from "../utils/terminalActivity";

export type TerminalStatusLoader = (ids: string[]) => Promise<Record<string, PtyStatus>>;

export type TerminalActivityMonitorOptions = {
  tabs: TerminalTab[];
  loadStatuses?: TerminalStatusLoader;
  pollIntervalMs?: number;
  triggerDelayMs?: number;
};

export type TerminalActivityMonitor = {
  start: () => void;
  refresh: () => Promise<void>;
  trigger: () => void;
  dispose: () => void;
};

/**
 * Coordinates batched PTY inspection for periodic polling and event-driven
 * refreshes. Only snapshots for the session originally requested are applied.
 */
export function createTerminalActivityMonitor({
  tabs,
  loadStatuses = getTerminalStatuses,
  pollIntervalMs = 1_500,
  triggerDelayMs = 50,
}: TerminalActivityMonitorOptions): TerminalActivityMonitor {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let triggerTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshPending = false;
  let refreshQueued = false;
  let disposed = false;
  let started = false;

  function documentVisible(): boolean {
    return typeof document === "undefined" || !document.hidden;
  }

  async function refresh(): Promise<void> {
    if (disposed || !documentVisible()) return;
    if (refreshPending) {
      refreshQueued = true;
      return;
    }

    const requested = tabs.flatMap((tab) =>
      tab.session && !tab.disposed ? [[tab.id, tab.session.id] as const] : [],
    );
    if (!requested.length) return;

    refreshPending = true;
    try {
      const statuses = await loadStatuses(requested.map(([, sessionId]) => sessionId));
      if (disposed) return;

      for (const [tabId, sessionId] of requested) {
        const tab = tabs.find((item) => item.id === tabId);
        const snapshot = statuses[sessionId];
        if (!tab || !snapshot || tab.disposed || tab.session?.id !== sessionId) continue;
        Object.assign(tab, applyProcessSnapshot(tab, snapshot, tab.cwd));
        if (snapshot.processName && tab.lastCommandExitCode !== undefined) {
          tab.lastCommandExitCode = undefined;
          tab.status = "running";
          tab.detail = `${snapshot.processName} running`;
        }
      }
    } catch {
      // A status request can race with terminals being closed or restarted.
    } finally {
      refreshPending = false;
      if (refreshQueued && !disposed) {
        refreshQueued = false;
        void refresh();
      }
    }
  }

  function trigger(): void {
    if (disposed) return;
    if (triggerTimer !== undefined) clearTimeout(triggerTimer);
    triggerTimer = setTimeout(() => {
      triggerTimer = undefined;
      void refresh();
    }, triggerDelayMs);
  }

  function restartPolling(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    pollTimer = undefined;
    if (!started || disposed || !documentVisible()) return;
    pollTimer = setInterval(() => void refresh(), pollIntervalMs);
  }

  function handleVisibilityChange(): void {
    restartPolling();
    if (documentVisible()) void refresh();
  }

  function start(): void {
    if (disposed || started) return;
    started = true;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    restartPolling();
  }

  function dispose(): void {
    disposed = true;
    started = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (triggerTimer !== undefined) clearTimeout(triggerTimer);
    pollTimer = undefined;
    triggerTimer = undefined;
    refreshQueued = false;
  }

  return { start, refresh, trigger, dispose };
}
