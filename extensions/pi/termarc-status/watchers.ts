import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  listSubagents,
  parseSubagentWait,
  SUBAGENT_WAIT_EXEC_TIMEOUT_MS,
  subagentWaitArguments,
  type SubagentStatus,
} from "./cli";

export type SubagentNotification = {
  kind: "result" | "finished";
  resultUpdatedAt?: number;
};

export type NotificationDeliveryState = "pending" | "delivered";
export type PersistedWatcherOperation =
  | { kind: "tracked"; id: string }
  | { kind: "notification"; key: string; state: NotificationDeliveryState };

export const SUBAGENT_NOTIFICATION_OPTIONS = {
  deliverAs: "followUp",
  triggerTurn: true,
} as const;

const WATCHER_STATE = Symbol.for("termarc.pi.subagent-watchers.v2");
const MAX_PROCESS_LEDGER_ENTRIES = 4_096;
type LedgerKind = "delivered" | "tracked";
type DeliveryClaim = { owner: symbol; done: Promise<void>; release: () => void };
type ProcessWatcherState = {
  delivered: Set<string>;
  tracked: Set<string>;
  deliveredOwners: Map<string, Set<symbol>>;
  trackedOwners: Map<string, Set<symbol>>;
  accepted: Set<string>;
  claims: Map<string, DeliveryClaim>;
};
type GlobalWithWatcherState = typeof globalThis & { [WATCHER_STATE]?: ProcessWatcherState };

function processWatcherState(): ProcessWatcherState {
  const target = globalThis as GlobalWithWatcherState;
  return (target[WATCHER_STATE] ??= {
    delivered: new Set<string>(),
    tracked: new Set<string>(),
    deliveredOwners: new Map<string, Set<symbol>>(),
    trackedOwners: new Map<string, Set<symbol>>(),
    accepted: new Set<string>(),
    claims: new Map<string, DeliveryClaim>(),
  });
}

/** Process-local delivered ledger used to deduplicate overlapping extension instances. */
export function processNotificationLedger(): Set<string> {
  return processWatcherState().delivered;
}

function ledgerParts(kind: LedgerKind): [Set<string>, Map<string, Set<symbol>>] {
  const state = processWatcherState();
  return kind === "delivered"
    ? [state.delivered, state.deliveredOwners]
    : [state.tracked, state.trackedOwners];
}

function rememberOwned(kind: LedgerKind, owner: symbol, value: string): void {
  const [values, ownersByValue] = ledgerParts(kind);
  let owners = ownersByValue.get(value);
  if (!owners) ownersByValue.set(value, (owners = new Set()));
  owners.add(owner);
  values.delete(value);
  values.add(value);
  while (values.size > MAX_PROCESS_LEDGER_ENTRIES) {
    const oldest = values.values().next().value as string | undefined;
    if (oldest === undefined) break;
    values.delete(oldest);
    ownersByValue.delete(oldest);
  }
}

function forgetOwned(kind: LedgerKind, owner: symbol, value: string): void {
  const [values, ownersByValue] = ledgerParts(kind);
  const owners = ownersByValue.get(value);
  owners?.delete(owner);
  if (!owners?.size) {
    ownersByValue.delete(value);
    values.delete(value);
  }
}

/** Test-only shared-state reset; production instances never globally clear each other. */
export function resetProcessWatcherStateForTests(): void {
  const state = processWatcherState();
  state.delivered.clear();
  state.tracked.clear();
  state.deliveredOwners.clear();
  state.trackedOwners.clear();
  state.accepted.clear();
  state.claims.clear();
}

export function notificationKey(
  status: SubagentStatus,
  notification: SubagentNotification,
): string {
  return notification.kind === "result"
    ? `${status.id}:result:${notification.resultUpdatedAt}`
    : `${status.id}:finished`;
}

export function subagentNotification(
  status: SubagentStatus,
  delivered: ReadonlySet<string> = new Set(),
): SubagentNotification | undefined {
  const settled = status.piState === "waiting" || status.lifecycle !== "running";
  if (settled && status.resultAvailable && status.resultUpdatedAt !== undefined) {
    const notification = { kind: "result", resultUpdatedAt: status.resultUpdatedAt } as const;
    return delivered.has(notificationKey(status, notification)) ? undefined : notification;
  }
  // A consumed structured result keeps resultUpdatedAt. Do not emit a second,
  // generic process-finished notification when that Pi process later exits.
  if (status.lifecycle !== "running" && status.resultUpdatedAt === undefined) {
    const notification = { kind: "finished" } as const;
    return delivered.has(notificationKey(status, notification)) ? undefined : notification;
  }
  return undefined;
}

export function watcherReconciliation(
  statuses: readonly SubagentStatus[],
  watchedIds: Iterable<string>,
): { start: string[]; stop: string[] } {
  const activeIds = new Set(
    statuses.filter((status) => status.lifecycle === "running").map((status) => status.id),
  );
  const watched = new Set(watchedIds);
  return {
    start: [...activeIds].filter((id) => !watched.has(id)),
    stop: [...watched].filter((id) => !activeIds.has(id)),
  };
}

export function shouldNotifySubagentWait(wait: { timedOut: boolean }): boolean {
  return !wait.timedOut;
}

export type WatcherCallbacks = {
  /** Return false when cancellation prevented the Pi message from being queued. */
  notify(
    status: SubagentStatus,
    notification: SubagentNotification,
    signal: AbortSignal,
  ): boolean | void | Promise<boolean | void>;
  persist(operation: PersistedWatcherOperation): void | Promise<void>;
  error(message: string, error: unknown): void;
};

export class SubagentWatchers {
  private readonly owner = Symbol("termarc-subagent-watchers");
  private readonly controllers = new Map<string, AbortController>();
  private readonly delivered = processNotificationLedger();
  private readonly ownedDelivered = new Set<string>();
  private readonly ownedPending = new Set<string>();
  private readonly ownedTracked = new Set<string>();
  private readonly notificationTasks = new Map<string, Promise<void>>();
  private readonly watcherTasks = new Map<string, Promise<void>>();
  private stopped = false;
  private generation = 0;
  private generationController = new AbortController();
  private reconciliation: Promise<void> = Promise.resolve();
  private shutdownTask?: Promise<void>;

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly cli: string,
    private readonly parentTerminalId: string,
    private readonly callbacks: WatcherCallbacks,
  ) {}

  restore(operations: readonly PersistedWatcherOperation[]): void {
    this.cancelGeneration();
    const restoredTracked = new Set<string>();
    const restoredDelivered = new Set<string>();
    const restoredPending = new Set<string>();
    for (const operation of operations) {
      if (operation.kind === "tracked") {
        restoredTracked.add(operation.id);
      } else if (operation.state === "delivered") {
        restoredPending.delete(operation.key);
        restoredDelivered.add(operation.key);
      } else if (!restoredDelivered.has(operation.key)) {
        restoredPending.add(operation.key);
      }
    }
    this.replaceOwnedLedger("tracked", this.ownedTracked, restoredTracked);
    this.replaceOwnedLedger("delivered", this.ownedDelivered, restoredDelivered);
    this.ownedPending.clear();
    for (const key of restoredPending) this.ownedPending.add(key);
  }

  async watch(id: string, initialStatus?: SubagentStatus): Promise<void> {
    const generation = this.generation;
    if (!this.isActive(generation) || this.controllers.has(id)) return;
    if (!this.ownedTracked.has(id)) {
      // Persistence precedes runtime ownership. If shutdown/reload happens at
      // this boundary, the durable tracked entry is recovered by that session's
      // next extension instance and this stale instance does not start a wait.
      try {
        await this.callbacks.persist({ kind: "tracked", id });
      } catch (error) {
        if (this.isActive(generation)) {
          this.callbacks.error("Termarc could not persist a tracked subagent:", error);
        }
      }
      if (!this.isActive(generation)) return;
      this.rememberOwned("tracked", this.ownedTracked, id);
    }
    if (!this.isActive(generation) || this.controllers.has(id)) return;
    const controller = new AbortController();
    this.generationController.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    this.controllers.set(id, controller);
    const task = this.run(id, controller, generation, initialStatus).finally(() => {
      if (this.watcherTasks.get(id) === task) this.watcherTasks.delete(id);
    });
    this.watcherTasks.set(id, task);
  }

  reconcile(): Promise<void> {
    const generation = this.generation;
    this.reconciliation = this.reconciliation
      .catch(() => undefined)
      .then(async () => {
        if (!this.isActive(generation)) return;
        let statuses: SubagentStatus[];
        try {
          statuses = await listSubagents(
            this.pi,
            this.cli,
            this.parentTerminalId,
            this.generationController.signal,
          );
        } catch (error) {
          if (!this.isActive(generation)) return;
          throw error;
        }
        if (!this.isActive(generation)) return;
        const ownedStatuses = statuses.filter((status) => this.ownedTracked.has(status.id));
        const byId = new Map(ownedStatuses.map((status) => [status.id, status]));
        const actions = watcherReconciliation(ownedStatuses, this.controllers.keys());
        for (const id of actions.stop) this.controllers.get(id)?.abort();
        for (const status of ownedStatuses) {
          if (status.lifecycle !== "running") await this.maybeNotify(status, generation);
          if (!this.isActive(generation)) return;
        }
        for (const id of actions.start) {
          await this.watch(id, byId.get(id));
          if (!this.isActive(generation)) return;
        }
      });
    return this.reconciliation;
  }

  shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask;
    this.stopped = true;
    this.cancelGeneration(false);
    this.shutdownTask = (async () => {
      await this.reconciliation.catch(() => undefined);
      while (this.watcherTasks.size || this.notificationTasks.size) {
        await Promise.allSettled([
          ...this.watcherTasks.values(),
          ...this.notificationTasks.values(),
        ]);
      }
      this.releaseOwnedState();
    })();
    return this.shutdownTask;
  }

  private async maybeNotify(status: SubagentStatus, generation: number): Promise<void> {
    if (!this.isActive(generation) || !this.ownedTracked.has(status.id)) return;
    while (this.isActive(generation)) {
      const notification = subagentNotification(status);
      if (!notification) return;
      const key = notificationKey(status, notification);
      if (this.delivered.has(key)) return;
      const local = this.notificationTasks.get(key);
      if (local) return local;

      const processState = processWatcherState();
      const existingClaim = processState.claims.get(key);
      if (existingClaim) {
        await existingClaim.done;
        continue;
      }

      let release!: () => void;
      const done = new Promise<void>((resolve) => (release = resolve));
      const claim = { owner: this.owner, done, release };
      processState.claims.set(key, claim);
      const task = (
        processState.accepted.has(key)
          ? this.persistDelivered(key)
          : this.deliver(status, notification, key, generation)
      ).finally(() => {
        if (processState.claims.get(key) === claim) processState.claims.delete(key);
        release();
        if (this.notificationTasks.get(key) === task) this.notificationTasks.delete(key);
      });
      this.notificationTasks.set(key, task);
      return task;
    }
  }

  private async deliver(
    status: SubagentStatus,
    notification: SubagentNotification,
    key: string,
    generation: number,
  ): Promise<void> {
    try {
      await this.callbacks.persist({ kind: "notification", key, state: "pending" });
      this.ownedPending.add(key);
    } catch (error) {
      if (this.isActive(generation)) {
        this.callbacks.error("Termarc could not persist a pending subagent notification:", error);
      }
      return;
    }
    if (!this.isActive(generation)) return;

    let queued: boolean | void;
    try {
      queued = await this.callbacks.notify(status, notification, this.generationController.signal);
    } catch (error) {
      if (this.isActive(generation)) {
        this.callbacks.error("Termarc could not queue a subagent notification:", error);
      }
      return;
    }
    if (queued === false) return;

    // Once Pi accepted the message, process-local accepted state makes retries
    // persist-only. A graceful reload therefore cannot queue the same message
    // again when the delivered append transiently fails.
    const accepted = processWatcherState().accepted;
    accepted.add(key);
    while (accepted.size > MAX_PROCESS_LEDGER_ENTRIES) {
      const oldest = accepted.values().next().value as string | undefined;
      if (oldest === undefined) break;
      accepted.delete(oldest);
    }
    await this.persistDelivered(key);
  }

  private async persistDelivered(key: string): Promise<void> {
    try {
      await this.callbacks.persist({ kind: "notification", key, state: "delivered" });
      processWatcherState().accepted.delete(key);
      this.ownedPending.delete(key);
      this.rememberOwned("delivered", this.ownedDelivered, key);
    } catch (error) {
      this.callbacks.error("Termarc could not persist a delivered subagent notification:", error);
    }
  }

  private cancelGeneration(replace = true): void {
    this.generation += 1;
    this.generationController.abort();
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    if (replace && !this.stopped) this.generationController = new AbortController();
  }

  private isActive(generation: number): boolean {
    return !this.stopped && generation === this.generation;
  }

  private rememberOwned(kind: LedgerKind, owned: Set<string>, value: string): void {
    owned.add(value);
    rememberOwned(kind, this.owner, value);
  }

  private forgetOwned(kind: LedgerKind, owned: Set<string>, value: string): void {
    owned.delete(value);
    forgetOwned(kind, this.owner, value);
  }

  private replaceOwnedLedger(
    kind: LedgerKind,
    owned: Set<string>,
    replacement: ReadonlySet<string>,
  ): void {
    for (const value of [...owned]) {
      if (!replacement.has(value)) this.forgetOwned(kind, owned, value);
    }
    for (const value of replacement) {
      if (!owned.has(value)) this.rememberOwned(kind, owned, value);
    }
  }

  private releaseOwnedState(): void {
    this.replaceOwnedLedger("tracked", this.ownedTracked, new Set());
    this.replaceOwnedLedger("delivered", this.ownedDelivered, new Set());
    this.ownedPending.clear();
  }

  private async run(
    id: string,
    controller: AbortController,
    generation: number,
    initialStatus?: SubagentStatus,
  ): Promise<void> {
    let status = initialStatus;
    try {
      while (this.isActive(generation) && !controller.signal.aborted) {
        if (status) {
          await this.maybeNotify(status, generation);
          if (!this.isActive(generation) || status.lifecycle !== "running") break;
        }
        const returnOnResult = !status?.resultAvailable;
        const result = await this.pi.exec(this.cli, subagentWaitArguments(id, returnOnResult), {
          signal: controller.signal,
          timeout: SUBAGENT_WAIT_EXEC_TIMEOUT_MS,
        });
        if (!this.isActive(generation) || controller.signal.aborted) break;
        if (result.code !== 0) throw new Error(result.stderr || "Termarc wait failed");
        const wait = parseSubagentWait(result.stdout);
        status = wait.status;
        if (shouldNotifySubagentWait(wait)) await this.maybeNotify(status, generation);
        if (!this.isActive(generation) || status.lifecycle !== "running") break;
      }
    } catch (error) {
      if (this.isActive(generation) && !controller.signal.aborted) {
        this.callbacks.error("Termarc subagent watcher stopped:", error);
      }
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id);
    }
  }
}
