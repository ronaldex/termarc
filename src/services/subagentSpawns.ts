import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  acknowledgeSubagentSpawn,
  registerTopLevelTerminals,
  type SubagentCloseRequest,
  type SubagentSpawnAcknowledgement,
  type SubagentSpawnRequest,
  type TopLevelTerminalMetadata,
} from "../api/subagentSpawns";
import { normalizedTerminalParentId } from "../utils/terminalHierarchy";
import type {
  TerminalLaunch,
  TerminalStartResult,
  TerminalTab,
  TerminalTabState,
} from "../types/terminal";

export const SUBAGENT_SPAWN_EVENT = "termarc://subagent-spawn-request";
export const SUBAGENT_CLOSE_EVENT = "termarc://subagent-close-request";

type CreateTab = (
  projectId: string,
  cwd: string,
  options: {
    launch: TerminalLaunch;
    launchTitle: string;
    start: false;
    activate: boolean;
  },
) => Promise<TerminalTab | undefined>;

export type SubagentSpawnDependencies = {
  createTab: CreateTab;
  startTab: (tab: TerminalTab) => Promise<TerminalStartResult>;
  closeTab: (tabId: string) => Promise<void>;
  acknowledge?: (acknowledgement: SubagentSpawnAcknowledgement) => Promise<void>;
  isParentAvailable?: (terminalId: string, projectId: string) => boolean;
};

export function topLevelTerminalMetadata(
  tabs: readonly TerminalTabState[],
): TopLevelTerminalMetadata[] {
  return tabs
    .filter((tab) => tab.launch.kind !== "subagent" && !normalizedTerminalParentId(tabs, tab))
    .map((tab) => ({ terminalId: tab.id, projectId: tab.projectId }));
}

export async function handleSubagentSpawnRequest(
  request: SubagentSpawnRequest,
  dependencies: SubagentSpawnDependencies,
): Promise<void> {
  const acknowledge = dependencies.acknowledge ?? acknowledgeSubagentSpawn;
  let tab: TerminalTab | undefined;
  let success = false;
  let error: string | undefined;

  try {
    if (dependencies.isParentAvailable?.(request.parentTerminalId, request.projectId) === false)
      throw new Error("parent terminal is no longer available");
    tab = await dependencies.createTab(request.projectId, request.cwd, {
      launch: {
        kind: "subagent",
        subagentId: request.subagentId,
        parentTerminalId: request.parentTerminalId,
        name: request.name,
        commandLine: request.command,
        processKind: request.processKind,
      },
      launchTitle: request.name,
      start: false,
      activate: false,
    });
    if (!tab) throw new Error("terminal view is unavailable");
    const start = await dependencies.startTab(tab);
    if (start.outcome === "running" || start.outcome === "exited") success = true;
    else if (start.outcome === "failed") throw new Error(start.error);
    else throw new Error("subagent PTY start was cancelled");
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    if (tab) await dependencies.closeTab(tab.id).catch(() => undefined);
  }

  try {
    await acknowledge({
      subagentId: request.subagentId,
      success,
      ...(error ? { error } : {}),
    });
  } catch (cause) {
    // The backend may have timed out and rolled back while the PTY was
    // starting. Do not leave an untracked terminal/process in the UI.
    if (success && tab) await dependencies.closeTab(tab.id).catch(() => undefined);
    throw cause;
  }
}

export function createSubagentSpawnService(dependencies: SubagentSpawnDependencies) {
  let unlistenSpawn: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;
  let started = false;
  let disposed = false;
  let latestTerminals: TopLevelTerminalMetadata[] = [];
  let registrationInFlight = false;
  let registrationPending = false;

  function registerLatestTerminals(): void {
    registrationInFlight = true;
    const terminals = latestTerminals.map((terminal) => ({ ...terminal }));
    void Promise.resolve()
      .then(() => {
        if (disposed || !started) return;
        return registerTopLevelTerminals(terminals);
      })
      .catch((error) => console.error("Could not register top-level terminals", error))
      .finally(() => {
        registrationInFlight = false;
        if (!registrationPending || disposed || !started) {
          registrationPending = false;
          return;
        }
        registrationPending = false;
        registerLatestTerminals();
      });
  }

  function queueRegistration(): void {
    if (!started || disposed) return;
    if (registrationInFlight) {
      registrationPending = true;
      return;
    }
    registerLatestTerminals();
  }

  return {
    update(tabs: readonly TerminalTabState[]): void {
      latestTerminals = topLevelTerminalMetadata(tabs);
      queueRegistration();
    },
    async start(): Promise<void> {
      if (started || disposed) return;
      unlistenSpawn = await listen<SubagentSpawnRequest>(SUBAGENT_SPAWN_EVENT, (event) => {
        void handleSubagentSpawnRequest(event.payload, {
          ...dependencies,
          isParentAvailable: (terminalId, projectId) =>
            latestTerminals.some(
              (terminal) => terminal.terminalId === terminalId && terminal.projectId === projectId,
            ),
        }).catch((error) => console.error("Could not acknowledge subagent spawn", error));
      });
      unlistenClose = await listen<SubagentCloseRequest>(SUBAGENT_CLOSE_EVENT, (event) => {
        void dependencies
          .closeTab(event.payload.terminalId)
          .catch((error) => console.error("Could not close subagent terminal", error));
      });
      if (disposed) {
        unlistenSpawn();
        unlistenClose();
        unlistenSpawn = undefined;
        unlistenClose = undefined;
        return;
      }
      started = true;
      queueRegistration();
    },
    dispose(): void {
      disposed = true;
      started = false;
      registrationPending = false;
      unlistenSpawn?.();
      unlistenClose?.();
      unlistenSpawn = undefined;
      unlistenClose = undefined;
    },
  };
}
