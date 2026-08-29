import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assistantText,
  listSubagents,
  notificationKey,
  parseControlResponse,
  parseEmptyResponse,
  parseSpawnedSubagent,
  parseSubagentList,
  parseSubagentListPage,
  parseSubagentOutput,
  parseSubagentResult,
  parseSubagentStatus,
  parseSubagentWait,
  persistedWatcherOperations,
  piStatusOsc,
  reportPiStatus,
  resetProcessWatcherStateForTests,
  resolveAvailableSubagentModel,
  SettledResultCollector,
  SubagentWatchers,
  SUBAGENT_NOTIFICATION_OPTIONS,
  shouldNotifySubagentWait,
  shouldReportPiStatus,
  subagentListArguments,
  subagentNotification,
  subagentProcessSpawnArguments,
  subagentWaitArguments,
  termarcMainTerminalCli,
  termarcSubagentCli,
  watcherReconciliation,
} from "./termarc-status";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/control-protocol.json", import.meta.url), "utf8"),
) as {
  protocolVersion: number;
  requests: Record<string, unknown>;
  responses: Record<string, unknown>;
  olderResponse: unknown;
  malformedResponses: unknown[];
  extensionPayloads: Record<string, unknown>;
};

describe("Pi status extension modes", () => {
  beforeEach(() => resetProcessWatcherStateForTests());
  it("emits OSC only in interactive TUI mode without corrupting structured stdout", () => {
    expect(shouldReportPiStatus("tui")).toBe(true);
    for (const mode of ["json", "print", "rpc"]) {
      const writes: string[] = [];
      reportPiStatus("waiting", { mode } as never, (value) => writes.push(value));
      expect(writes).toEqual([]);
    }
    const writes: string[] = [];
    reportPiStatus("processing", { mode: "tui" } as never, (value) => writes.push(value));
    expect(writes).toEqual([piStatusOsc("processing")]);
  });

  it("enables subagent tools only for a top-level Termarc terminal", () => {
    expect(
      termarcMainTerminalCli({
        TERM_PROGRAM: "Termarc",
        TERMARC_TERMINAL_ID: "terminal-1",
        TERMARC_CLI: "/Applications/Termarc.app/Contents/MacOS/termarc",
      }),
    ).toBe("/Applications/Termarc.app/Contents/MacOS/termarc");
    expect(
      termarcMainTerminalCli({ TERM_PROGRAM: "Termarc", TERMARC_TERMINAL_ID: "terminal-1" }),
    ).toBeUndefined();
    expect(
      termarcMainTerminalCli({
        TERM_PROGRAM: "Termarc",
        TERMARC_TERMINAL_ID: "terminal-child",
        TERMARC_PARENT_TERMINAL_ID: "terminal-1",
        TERMARC_SUBAGENT_ID: "subagent-1",
        TERMARC_CLI: "/Applications/Termarc.app/Contents/MacOS/termarc",
      }),
    ).toBeUndefined();
  });

  it("allows managed child Pi sessions to report structured results only", () => {
    const environment = {
      TERM_PROGRAM: "Termarc",
      TERMARC_TERMINAL_ID: "terminal-child",
      TERMARC_PARENT_TERMINAL_ID: "terminal-1",
      TERMARC_SUBAGENT_ID: "subagent-1",
      TERMARC_CLI: "/Applications/Termarc.app/Contents/MacOS/termarc",
    };
    expect(termarcSubagentCli(environment)).toBe(environment.TERMARC_CLI);
    expect(termarcSubagentCli({ ...environment, TERMARC_SUBAGENT_ID: "" })).toBeUndefined();
  });

  it("notifies exactly once for a settled result and never follows it with finished", () => {
    const initial = {
      id: "subagent-1",
      name: "Test",
      lifecycle: "running" as const,
      piState: "waiting" as const,
      resultAvailable: false,
    };
    expect(subagentNotification(initial)).toBeUndefined();

    const completed = { ...initial, resultAvailable: true, resultUpdatedAt: 42 };
    const notification = subagentNotification(completed);
    expect(notification).toEqual({ kind: "result", resultUpdatedAt: 42 });
    const notified = new Set([notificationKey(completed, notification!)]);
    expect(subagentNotification(completed, notified)).toBeUndefined();
    expect(
      subagentNotification({
        ...completed,
        lifecycle: "exited",
        piState: "stopped",
        resultAvailable: false,
      }),
    ).toBeUndefined();
    expect(subagentNotification({ ...initial, lifecycle: "exited", piState: "stopped" })).toEqual({
      kind: "finished",
    });
  });

  it("does not notify the parent when a long poll merely times out", () => {
    expect(shouldNotifySubagentWait({ timedOut: true })).toBe(false);
    expect(shouldNotifySubagentWait({ timedOut: false })).toBe(true);
  });

  it("builds unchanged process spawn and watcher CLI arguments", () => {
    expect(subagentProcessSpawnArguments("Tauri build", ["npm", "run", "tauri", "build"])).toEqual([
      "--json",
      "subagents",
      "spawn",
      "--name",
      "Tauri build",
      "--kind",
      "process",
      "--",
      "npm",
      "run",
      "tauri",
      "build",
    ]);
    expect(subagentListArguments("terminal-1")).toEqual([
      "--json",
      "subagents",
      "list",
      "--parent",
      "terminal-1",
      "--limit",
      "64",
    ]);
    expect(subagentListArguments("terminal-1", "v1:9")).toEqual([
      "--json",
      "subagents",
      "list",
      "--parent",
      "terminal-1",
      "--limit",
      "64",
      "--cursor",
      "v1:9",
    ]);
    expect(subagentWaitArguments("subagent-1")).toEqual([
      "--json",
      "subagents",
      "wait",
      "subagent-1",
      "--result",
      "--timeout",
      "300",
    ]);
    expect(subagentWaitArguments("subagent-1", false)).toEqual([
      "--json",
      "subagents",
      "wait",
      "subagent-1",
      "--timeout",
      "300",
    ]);
    expect(SUBAGENT_NOTIFICATION_OPTIONS).toEqual({ deliverAs: "followUp", triggerTurn: true });
  });

  it("iterates bounded list pages and rejects malformed or repeated cursors", async () => {
    const statuses = Array.from({ length: 150 }, (_, index) => ({
      id: `subagent-${index + 1}`,
      name: "x".repeat(index === 149 ? 16 * 1024 : 8),
      lifecycle: "running" as const,
      resultAvailable: false,
    }));
    const calls: string[][] = [];
    const pi = {
      exec: async (_cli: string, args: string[]) => {
        calls.push(args);
        const cursorIndex = args.indexOf("--cursor");
        const offset = cursorIndex < 0 ? 0 : Number(args[cursorIndex + 1]);
        const items = statuses.slice(offset, offset + 64);
        const nextCursor =
          offset + items.length < statuses.length ? String(offset + items.length) : undefined;
        return { code: 0, stdout: JSON.stringify({ items, nextCursor }), stderr: "" };
      },
    };
    expect(await listSubagents(pi as never, "/termarc", "parent")).toEqual(statuses);
    expect(calls).toHaveLength(3);
    expect(calls.every((args) => args.includes("--limit"))).toBe(true);

    expect(() => parseSubagentListPage(JSON.stringify({ items: [], nextCursor: "" }))).toThrow(
      /malformed/,
    );
    await expect(
      listSubagents(
        {
          exec: async () => ({
            code: 0,
            stdout: JSON.stringify({ items: [], nextCursor: "repeat" }),
            stderr: "",
          }),
        } as never,
        "/termarc",
        "parent",
      ),
    ).rejects.toThrow(/repeated/);
  });

  it("reconciles active missing watchers idempotently", () => {
    expect(
      watcherReconciliation(
        [
          { id: "active-existing", name: "Existing", lifecycle: "running", resultAvailable: false },
          { id: "active-missing", name: "Missing", lifecycle: "running", resultAvailable: false },
          { id: "finished", name: "Finished", lifecycle: "exited", resultAvailable: false },
        ],
        ["active-existing", "stale"],
      ),
    ).toEqual({ start: ["active-missing"], stop: ["stale"] });
  });

  it("queues one notification across repeated reconciliation", async () => {
    const status = {
      id: "idempotent-result-fixture",
      name: "Idempotent",
      lifecycle: "running" as const,
      piState: "waiting" as const,
      resultAvailable: true,
      resultUpdatedAt: 777,
    };
    const notifications: (typeof status)[] = [];
    const pi = {
      exec: async (_cli: string, args: string[], options: { signal?: AbortSignal }) => {
        if (args.includes("list")) {
          return { code: 0, stdout: JSON.stringify([status]), stderr: "" };
        }
        return await new Promise((resolve) => {
          options.signal?.addEventListener(
            "abort",
            () => resolve({ code: 0, stdout: "", stderr: "" }),
            { once: true },
          );
        });
      },
    };
    const watchers = new SubagentWatchers(pi as never, "/termarc", "parent", {
      notify: (notifiedStatus) => {
        notifications.push(notifiedStatus as typeof status);
      },
      persist: () => undefined,
      error: () => undefined,
    });
    watchers.restore([{ kind: "tracked", id: status.id }]);
    await Promise.all([watchers.reconcile(), watchers.reconcile()]);
    await Promise.resolve();
    expect(notifications).toHaveLength(1);
    watchers.shutdown();
  });

  it("awaits durable dedup persistence and retries after persistence failure", async () => {
    const status = {
      id: "durable-result-fixture",
      name: "Durable",
      lifecycle: "exited" as const,
      piState: "stopped" as const,
      resultAvailable: true,
      resultUpdatedAt: 901,
    };
    let persistenceAttempts = 0;
    const order: string[] = [];
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const watchers = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: async () => {
        persistenceAttempts += 1;
        order.push(`persist-${persistenceAttempts}`);
        if (persistenceAttempts === 1) throw new Error("disk full");
      },
      notify: () => {
        order.push("notify");
      },
      error: () => undefined,
    });
    watchers.restore([{ kind: "tracked", id: status.id }]);
    await watchers.reconcile();
    expect(order).toEqual(["persist-1"]);
    await watchers.reconcile();
    expect(order).toEqual(["persist-1", "persist-2", "notify", "persist-3"]);
    watchers.shutdown();
  });

  it("retries only delivered persistence after Pi has accepted a completion", async () => {
    const status = {
      id: "delivered-retry-fixture",
      name: "Delivered retry",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const operations: unknown[] = [];
    const notifications: string[] = [];
    let deliveredAttempts = 0;
    const watchers = new SubagentWatchers(
      {
        exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
      } as never,
      "/termarc",
      "parent",
      {
        persist: (operation) => {
          operations.push(operation);
          if (operation.kind === "notification" && operation.state === "delivered") {
            deliveredAttempts += 1;
            if (deliveredAttempts === 1) throw new Error("temporary append failure");
          }
        },
        notify: () => notifications.push("queued"),
        error: () => undefined,
      },
    );
    watchers.restore([{ kind: "tracked", id: status.id }]);
    await watchers.reconcile();
    await watchers.reconcile();
    expect(notifications).toEqual(["queued"]);
    expect(operations).toEqual([
      { kind: "notification", key: `${status.id}:finished`, state: "pending" },
      { kind: "notification", key: `${status.id}:finished`, state: "delivered" },
      { kind: "notification", key: `${status.id}:finished`, state: "delivered" },
    ]);
    await watchers.shutdown();
  });

  it("leaves an explicit pending operation when notification delivery reports failure", async () => {
    const status = {
      id: "delivery-failure-fixture",
      name: "Delivery failure",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const operations: unknown[] = [];
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const watchers = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => {
        operations.push(operation);
      },
      notify: () => {
        throw new Error("queue unavailable");
      },
      error: () => undefined,
    });
    watchers.restore([{ kind: "tracked", id: status.id }]);
    await watchers.reconcile();
    expect(operations).toEqual([
      { kind: "notification", key: `${status.id}:finished`, state: "pending" },
    ]);
    watchers.shutdown();
  });

  it("restores tracked children and emits one generic completion after restart", async () => {
    const status = {
      id: "restored-process-fixture",
      name: "Build",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const notifications: string[] = [];
    const persisted: unknown[] = [];
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const watchers = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => {
        persisted.push(operation);
      },
      notify: (_notifiedStatus, notification) => {
        notifications.push(notification.kind);
      },
      error: () => undefined,
    });
    watchers.restore([{ kind: "tracked", id: status.id }]);
    await watchers.reconcile();
    await watchers.reconcile();
    expect(notifications).toEqual(["finished"]);
    expect(persisted).toEqual([
      { kind: "notification", key: `${status.id}:finished`, state: "pending" },
      { kind: "notification", key: `${status.id}:finished`, state: "delivered" },
    ]);
    watchers.shutdown();
  });

  it("overlapping restores cannot clear another watcher instance's ledger", async () => {
    const status = {
      id: "overlap-child",
      name: "Overlap",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const notifications: string[] = [];
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const first = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: () => undefined,
      notify: () => notifications.push("first"),
      error: () => undefined,
    });
    const second = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: () => undefined,
      notify: () => notifications.push("second"),
      error: () => undefined,
    });
    first.restore([
      { kind: "tracked", id: status.id },
      { kind: "notification", key: `${status.id}:finished`, state: "delivered" },
    ]);
    second.restore([{ kind: "tracked", id: "other-child" }]);
    second.restore([]);

    await first.reconcile();
    expect(notifications).toEqual([]);
    first.shutdown();
    second.shutdown();
  });

  it("hands a cancelled pending delivery to an overlapping owner without duplicates", async () => {
    const status = {
      id: "overlap-result",
      name: "Overlap result",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    let releasePersistence!: () => void;
    let markPersistenceEntered!: () => void;
    const persistenceEntered = new Promise<void>((resolve) => (markPersistenceEntered = resolve));
    const persistenceGate = new Promise<void>((resolve) => (releasePersistence = resolve));
    const notifications: string[] = [];
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const first = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: () => {
        markPersistenceEntered();
        return persistenceGate;
      },
      notify: () => notifications.push("first"),
      error: () => undefined,
    });
    const second = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: () => undefined,
      notify: () => notifications.push("second"),
      error: () => undefined,
    });
    first.restore([{ kind: "tracked", id: status.id }]);
    const firstReconcile = first.reconcile();
    await persistenceEntered;

    first.restore([]);
    second.restore([{ kind: "tracked", id: status.id }]);
    const secondReconcile = second.reconcile();
    await Promise.resolve();
    expect(notifications).toEqual([]);

    releasePersistence();
    await Promise.all([firstReconcile, secondReconcile]);
    expect(notifications).toEqual(["second"]);
    await Promise.all([first.shutdown(), second.shutdown()]);
  });

  it("cancels ownership when shutdown pauses tracked-child persistence", async () => {
    let releaseTracked!: () => void;
    let markTrackedEntered!: () => void;
    const trackedEntered = new Promise<void>((resolve) => (markTrackedEntered = resolve));
    const trackedGate = new Promise<void>((resolve) => (releaseTracked = resolve));
    const execCalls: string[][] = [];
    const watchers = new SubagentWatchers(
      {
        exec: async (_cli: string, args: string[]) => {
          execCalls.push(args);
          return { code: 0, stdout: "", stderr: "" };
        },
      } as never,
      "/termarc",
      "parent",
      {
        persist: async () => {
          markTrackedEntered();
          await trackedGate;
        },
        notify: () => undefined,
        error: () => undefined,
      },
    );
    const watch = watchers.watch("paused-tracked");
    await trackedEntered;
    const shutdown = watchers.shutdown();
    releaseTracked();
    await Promise.all([watch, shutdown]);
    expect(execCalls).toEqual([]);
  });

  it("awaits and aborts a paused watcher wait task during shutdown", async () => {
    const running = {
      id: "paused-wait",
      name: "Paused wait",
      lifecycle: "running" as const,
      resultAvailable: false,
    };
    let markWaitEntered!: () => void;
    const waitEntered = new Promise<void>((resolve) => (markWaitEntered = resolve));
    const watchers = new SubagentWatchers(
      {
        exec: async (_cli: string, args: string[], options: { signal?: AbortSignal }) => {
          if (args.includes("list")) {
            return { code: 0, stdout: JSON.stringify([running]), stderr: "" };
          }
          markWaitEntered();
          return await new Promise((resolve) =>
            options.signal?.addEventListener(
              "abort",
              () => resolve({ code: 0, stdout: "", stderr: "" }),
              { once: true },
            ),
          );
        },
      } as never,
      "/termarc",
      "parent",
      {
        persist: () => undefined,
        notify: () => undefined,
        error: () => undefined,
      },
    );
    watchers.restore([{ kind: "tracked", id: running.id }]);
    await watchers.reconcile();
    await waitEntered;
    await watchers.shutdown();
  });

  it("awaits a paused list request on shutdown and suppresses its stale generation", async () => {
    let releaseList!: () => void;
    let markListEntered!: () => void;
    const listEntered = new Promise<void>((resolve) => (markListEntered = resolve));
    const listGate = new Promise<void>((resolve) => (releaseList = resolve));
    const notifications: string[] = [];
    const watchers = new SubagentWatchers(
      {
        exec: async () => {
          markListEntered();
          await listGate;
          return {
            code: 0,
            stdout: JSON.stringify([
              {
                id: "paused-list",
                name: "Paused list",
                lifecycle: "exited",
                resultAvailable: false,
              },
            ]),
            stderr: "",
          };
        },
      } as never,
      "/termarc",
      "parent",
      {
        persist: () => undefined,
        notify: () => notifications.push("late"),
        error: () => undefined,
      },
    );
    watchers.restore([{ kind: "tracked", id: "paused-list" }]);
    const reconcile = watchers.reconcile();
    await listEntered;
    let shutdownFinished = false;
    const shutdown = watchers.shutdown().then(() => (shutdownFinished = true));
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);
    releaseList();
    await Promise.all([reconcile, shutdown]);
    expect(notifications).toEqual([]);
  });

  it("recovers a pending entry after shutdown/reload at the pending-persist boundary", async () => {
    const status = {
      id: "pending-reload",
      name: "Pending reload",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const operations: import("./termarc-status").PersistedWatcherOperation[] = [
      { kind: "tracked", id: status.id },
    ];
    let releasePending!: () => void;
    let markPendingEntered!: () => void;
    const pendingEntered = new Promise<void>((resolve) => (markPendingEntered = resolve));
    const pendingGate = new Promise<void>((resolve) => (releasePending = resolve));
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const oldNotifications: string[] = [];
    const old = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => {
        operations.push(operation);
        if (operation.kind === "notification" && operation.state === "pending") {
          markPendingEntered();
          return pendingGate;
        }
      },
      notify: () => oldNotifications.push("old"),
      error: () => undefined,
    });
    old.restore([{ kind: "tracked", id: status.id }]);
    const reconcile = old.reconcile();
    await pendingEntered;
    const shutdown = old.shutdown();
    releasePending();
    await Promise.all([reconcile, shutdown]);
    expect(oldNotifications).toEqual([]);

    const replacementNotifications: string[] = [];
    const replacement = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => operations.push(operation),
      notify: () => replacementNotifications.push("replacement"),
      error: () => undefined,
    });
    replacement.restore(operations);
    await replacement.reconcile();
    expect(replacementNotifications).toEqual(["replacement"]);
    expect(operations.at(-1)).toEqual({
      kind: "notification",
      key: `${status.id}:finished`,
      state: "delivered",
    });
    await replacement.shutdown();
  });

  it("cancels a paused notification adapter before reload delivery", async () => {
    const status = {
      id: "notify-reload",
      name: "Notify reload",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const operations: import("./termarc-status").PersistedWatcherOperation[] = [
      { kind: "tracked", id: status.id },
    ];
    let releaseNotify!: () => void;
    let markNotifyEntered!: () => void;
    const notifyEntered = new Promise<void>((resolve) => (markNotifyEntered = resolve));
    const notifyGate = new Promise<void>((resolve) => (releaseNotify = resolve));
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const oldNotifications: string[] = [];
    const old = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => operations.push(operation),
      notify: async (_status, _notification, signal) => {
        markNotifyEntered();
        await notifyGate;
        if (signal.aborted) return false;
        oldNotifications.push("old");
        return true;
      },
      error: () => undefined,
    });
    old.restore([{ kind: "tracked", id: status.id }]);
    const reconcile = old.reconcile();
    await notifyEntered;
    const shutdown = old.shutdown();
    releaseNotify();
    await Promise.all([reconcile, shutdown]);
    expect(oldNotifications).toEqual([]);

    const replacementNotifications: string[] = [];
    const replacement = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => operations.push(operation),
      notify: () => replacementNotifications.push("replacement"),
      error: () => undefined,
    });
    replacement.restore(operations);
    await replacement.reconcile();
    expect(replacementNotifications).toEqual(["replacement"]);
    await replacement.shutdown();
  });

  it("does not replay after shutdown pauses delivered persistence", async () => {
    const status = {
      id: "delivered-reload",
      name: "Delivered reload",
      lifecycle: "exited" as const,
      resultAvailable: false,
    };
    const operations: import("./termarc-status").PersistedWatcherOperation[] = [
      { kind: "tracked", id: status.id },
    ];
    let releaseDelivered!: () => void;
    let markDeliveredEntered!: () => void;
    const deliveredEntered = new Promise<void>((resolve) => (markDeliveredEntered = resolve));
    const deliveredGate = new Promise<void>((resolve) => (releaseDelivered = resolve));
    const pi = {
      exec: async () => ({ code: 0, stdout: JSON.stringify([status]), stderr: "" }),
    };
    const notifications: string[] = [];
    const old = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: async (operation) => {
        if (operation.kind === "notification" && operation.state === "delivered") {
          markDeliveredEntered();
          await deliveredGate;
        }
        operations.push(operation);
      },
      notify: () => notifications.push("old"),
      error: () => undefined,
    });
    old.restore([{ kind: "tracked", id: status.id }]);
    const reconcile = old.reconcile();
    await deliveredEntered;
    const shutdown = old.shutdown();
    releaseDelivered();
    await Promise.all([reconcile, shutdown]);
    expect(notifications).toEqual(["old"]);

    const replacement = new SubagentWatchers(pi as never, "/termarc", "parent", {
      persist: (operation) => operations.push(operation),
      notify: () => notifications.push("replacement"),
      error: () => undefined,
    });
    replacement.restore(operations);
    await replacement.reconcile();
    expect(notifications).toEqual(["old"]);
    await replacement.shutdown();
  });

  it("restores current and legacy watcher ledger operations in branch order", () => {
    expect(
      persistedWatcherOperations([
        {
          type: "custom",
          customType: "termarc-subagent-watcher-ledger",
          data: { kind: "tracked", id: "subagent-1" },
        },
        {
          type: "custom",
          customType: "termarc-subagent-notification",
          data: { key: "subagent-1:finished" },
        },
        {
          type: "custom",
          customType: "termarc-subagent-watcher-ledger",
          data: { kind: "notification", key: "subagent-2:finished", notified: false },
        },
      ]),
    ).toEqual([
      { kind: "tracked", id: "subagent-1" },
      { kind: "notification", key: "subagent-1:finished", state: "delivered" },
      { kind: "notification", key: "subagent-2:finished", state: "pending" },
    ]);
  });

  it("shares current, older and malformed extension payload expectations", () => {
    expect(fixtures.protocolVersion).toBe(1);
    expect(
      parseSubagentList(JSON.stringify(fixtures.extensionPayloads.currentList))[0],
    ).toMatchObject({
      id: "subagent-current",
      resultAvailable: true,
      resultUpdatedAt: 42,
    });
    expect(
      parseSubagentList(JSON.stringify(fixtures.extensionPayloads.olderList))[0],
    ).toMatchObject({
      id: "subagent-older",
      resultAvailable: false,
    });
    expect(parseSubagentWait(JSON.stringify(fixtures.extensionPayloads.currentWait))).toMatchObject(
      {
        timedOut: false,
        status: { lifecycle: "exited", resultUpdatedAt: 42 },
      },
    );
    expect(() =>
      parseSubagentWait(JSON.stringify(fixtures.extensionPayloads.malformedWait)),
    ).toThrow(/malformed/);
  });

  it("validates shared success/error contracts for every control operation", () => {
    for (const operation of [
      "status",
      "spawn",
      "list",
      "subagentStatus",
      "wait",
      "output",
      "result",
      "input",
      "stop",
    ]) {
      const response = parseControlResponse(fixtures.responses[operation]);
      expect(response.ok, operation).toBe(true);
    }
    expect(parseControlResponse(fixtures.responses.error)).toMatchObject({
      ok: false,
      error: { code: "unknown_subagent" },
    });
    expect(() => parseControlResponse(fixtures.olderResponse)).toThrow(/unsupported protocol/);
    for (const malformed of fixtures.malformedResponses) {
      expect(() => parseControlResponse(malformed)).toThrow(/malformed/);
    }

    const successful = Object.fromEntries(
      Object.entries(fixtures.responses).map(([key, value]) => [
        key,
        (value as { result?: unknown }).result,
      ]),
    );
    expect(parseSpawnedSubagent(JSON.stringify(successful.spawn))).toEqual({ id: "subagent-1" });
    expect(parseSubagentListPage(JSON.stringify(successful.list)).items).toHaveLength(1);
    expect(parseSubagentStatus(successful.subagentStatus)).toMatchObject({ id: "subagent-1" });
    expect(parseSubagentWait(JSON.stringify(successful.wait))).toMatchObject({ timedOut: false });
    expect(parseSubagentOutput(successful.output)).toMatchObject({ cursor: 6, data: [111, 107] });
    expect(parseSubagentResult(successful.result)).toMatchObject({ text: "finished" });
    expect(parseEmptyResponse(successful.input)).toEqual({});
    expect(parseEmptyResponse(successful.stop)).toEqual({});
  });

  it("resolves subagent models only from the parent session model set", () => {
    const models = [
      { provider: "openai-codex", id: "gpt-5.4" },
      { provider: "anthropic", id: "claude-sonnet" },
    ];
    expect(resolveAvailableSubagentModel("openai-codex/gpt-5.4", models)).toBe(
      "openai-codex/gpt-5.4",
    );
    expect(resolveAvailableSubagentModel("claude-sonnet", models)).toBe("anthropic/claude-sonnet");
    expect(resolveAvailableSubagentModel("unavailable", models)).toBeUndefined();
    expect(
      resolveAvailableSubagentModel("shared", [
        { provider: "one", id: "shared" },
        { provider: "two", id: "shared" },
      ]),
    ).toBeUndefined();
  });

  it("never treats assistant tool calls as final results and clears failed/cancelled turns", () => {
    const toolCallingAssistant = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "secret" },
        { type: "text", text: "I will run it" },
        { type: "toolCall", name: "bash" },
      ],
    };
    expect(assistantText(toolCallingAssistant)).toBeUndefined();
    const collector = new SettledResultCollector();
    collector.observe({ role: "assistant", content: [{ type: "text", text: "older" }] });
    collector.observe(toolCallingAssistant);
    collector.observe({
      role: "toolResult",
      isError: true,
      content: [{ type: "text", text: "failed" }],
    });
    expect(collector.take()).toBeUndefined();

    collector.observe({ role: "assistant", content: [] });
    expect(collector.take()).toBeUndefined();
    collector.observe({ role: "assistant", content: [{ type: "toolCall", name: "read" }] });
    expect(collector.take()).toBeUndefined();
    collector.observe({ role: "assistant", content: [{ type: "text", text: "final" }] });
    expect(collector.take()).toBe("final");
    expect(collector.take()).toBeUndefined();
  });
});
