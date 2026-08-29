import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  subagentProcessSpawnArguments,
  parseSpawnedSubagent,
  SUBAGENT_WAIT_EXEC_TIMEOUT_MS,
} from "./termarc-status/cli";
import { termarcMainTerminalCli, termarcSubagentCli } from "./termarc-status/environment";
import { reportPiStatus } from "./termarc-status/osc";
import {
  clearSubagentResult,
  nextResultMutationSequence,
  publishSubagentResult,
  SettledResultCollector,
} from "./termarc-status/results";
import {
  SUBAGENT_NOTIFICATION_OPTIONS,
  SubagentWatchers,
  type PersistedWatcherOperation,
  type SubagentNotification,
} from "./termarc-status/watchers";
import type { SubagentStatus } from "./termarc-status/cli";

export * from "./termarc-status/cli";
export * from "./termarc-status/environment";
export * from "./termarc-status/osc";
export * from "./termarc-status/results";
export * from "./termarc-status/watchers";

const WATCHER_LEDGER_ENTRY = "termarc-subagent-watcher-ledger";
const LEGACY_NOTIFICATION_ENTRY = "termarc-subagent-notification";

export function resolveAvailableSubagentModel(
  requested: string,
  models: ReadonlyArray<{ provider: string; id: string }>,
): string | undefined {
  const exact = models.find((model) => `${model.provider}/${model.id}` === requested);
  if (exact) return `${exact.provider}/${exact.id}`;
  const byId = models.filter((model) => model.id === requested);
  const unique = byId.length === 1 ? byId[0] : undefined;
  return unique ? `${unique.provider}/${unique.id}` : undefined;
}

export function persistedWatcherOperations(
  entries: readonly unknown[],
): PersistedWatcherOperation[] {
  const operations: PersistedWatcherOperation[] = [];
  for (const value of entries) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (entry.type !== "custom" || !entry.data || typeof entry.data !== "object") continue;
    const data = entry.data as Record<string, unknown>;
    if (entry.customType === LEGACY_NOTIFICATION_ENTRY && typeof data.key === "string") {
      operations.push({ kind: "notification", key: data.key, state: "delivered" });
    } else if (entry.customType === WATCHER_LEDGER_ENTRY) {
      if (data.kind === "tracked" && typeof data.id === "string") {
        operations.push({ kind: "tracked", id: data.id });
      } else if (data.kind === "notification" && typeof data.key === "string") {
        if (data.state === "pending" || data.state === "delivered") {
          operations.push({ kind: "notification", key: data.key, state: data.state });
        } else if (typeof data.notified === "boolean") {
          // Migrate the pre-state-machine boolean ledger in branch order.
          operations.push({
            kind: "notification",
            key: data.key,
            state: data.notified ? "delivered" : "pending",
          });
        }
      }
    }
  }
  return operations;
}

function notifySubagentState(
  pi: ExtensionAPI,
  status: SubagentStatus,
  notification: SubagentNotification,
): void {
  const state =
    notification.kind === "result" ? "finished a turn with a result available" : status.lifecycle;
  const instruction =
    notification.kind === "result"
      ? "The structured result is now available; call termarc_subagent result exactly once and respond directly. Do not call wait, status, or output first."
      : "No structured result is available; inspect status or diagnostic output only if needed.";
  pi.sendMessage(
    {
      customType: "termarc-subagent",
      content: `Termarc subagent ${status.name} (${status.id}) is ${state}. ${instruction}`,
      display: false,
      details: { id: status.id, name: status.name, status },
    },
    SUBAGENT_NOTIFICATION_OPTIONS,
  );
}

export default async function (pi: ExtensionAPI) {
  const subagentCli = termarcSubagentCli();
  const resultCollector = new SettledResultCollector();

  // Generic status reporting remains safe when this extension is global. OSC
  // emission itself is mode-gated, keeping JSON/print/RPC stdout pristine.
  pi.on("session_start", (_event, context) => {
    resultCollector.reset();
    reportPiStatus("waiting", context);
  });
  pi.on("agent_start", async (_event, context) => {
    resultCollector.reset();
    // Invalidate before processing so a result from the previous turn cannot be
    // retrieved while this later turn is in flight. Sequencing makes a delayed
    // older report lose the race against this clear.
    if (subagentCli) {
      try {
        await clearSubagentResult(subagentCli, nextResultMutationSequence());
      } catch (error) {
        console.error("Termarc could not invalidate the previous Pi subagent result:", error);
      }
    }
    reportPiStatus("processing", context);
  });
  pi.on("message_end", (event) => {
    if (subagentCli) resultCollector.observe(event.message);
  });
  pi.on("agent_settled", async (_event, context) => {
    const result = resultCollector.take();
    let resultStatePublished = !subagentCli;
    if (subagentCli) {
      try {
        const sequence = nextResultMutationSequence();
        if (result) await publishSubagentResult(subagentCli, result, sequence);
        else await clearSubagentResult(subagentCli, sequence);
        resultStatePublished = true;
      } catch (error) {
        // Do not advertise a successful waiting/completion transition when the
        // backend never durably accepted this turn's result state. That avoids
        // silently publishing stale text as the answer to an empty later turn.
        console.error("Termarc could not publish the settled Pi subagent result state:", error);
      }
    }
    if (resultStatePublished) reportPiStatus("waiting", context);
  });
  pi.on("session_shutdown", (_event, context) => reportPiStatus("stopped", context));

  const cli = termarcMainTerminalCli();
  const parentTerminalId = process.env.TERMARC_TERMINAL_ID;
  if (!cli || !parentTerminalId) return;

  const [{ Type }, { Text }] = await Promise.all([
    import("typebox"),
    import("@earendil-works/pi-tui"),
  ]);

  const watchers = new SubagentWatchers(pi, cli, parentTerminalId, {
    notify: (status, notification, signal) => {
      if (signal.aborted) return false;
      notifySubagentState(pi, status, notification);
      return true;
    },
    // appendEntry is a synchronous durable SessionManager append in Pi's API.
    // Promise.resolve gives the watcher one awaitable persistence boundary and
    // also supports async/failing test adapters without queueing first.
    persist: (operation) => Promise.resolve(pi.appendEntry(WATCHER_LEDGER_ENTRY, operation)),
    error: (message, error) => console.error(message, error),
  });

  // session_start covers startup, extension reload, /new, /resume, /fork and
  // /clone. Restore the per-session ledger before reconciling registry state.
  pi.on("session_start", async (_event, context) => {
    watchers.restore(persistedWatcherOperations(context.sessionManager.getBranch()));
    await watchers
      .reconcile()
      .catch((error) => console.error("Termarc could not reconcile subagent watchers:", error));
  });
  // Tree navigation changes the active persisted branch without replacing the
  // runtime, so refresh both notification state and active child ownership.
  pi.on("session_tree", async (_event, context) => {
    watchers.restore(persistedWatcherOperations(context.sessionManager.getBranch()));
    await watchers
      .reconcile()
      .catch((error) => console.error("Termarc could not reconcile subagent watchers:", error));
  });

  pi.registerTool({
    name: "termarc_subagent_spawn",
    label: "Spawn Termarc Subagent",
    description:
      "Spawn a Pi subagent in a separate Termarc terminal and end the current tool loop. Do not retrieve its result immediately; a result-ready follow-up will notify this session when termarc_subagent result can succeed.",
    promptGuidelines: [
      "After termarc_subagent_spawn succeeds, do not call termarc_subagent or continue polling; the spawn tool ends the current turn and a result-ready follow-up will arrive automatically.",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Short task label for the subagent" }),
      prompt: Type.String({ description: "Task prompt for the Pi subagent" }),
      model: Type.Optional(
        Type.String({
          description:
            "Optional exact model ID or provider/model from the models available to the parent Pi session. Defaults to the parent's current model.",
        }),
      ),
      thinkingLevel: Type.Optional(
        Type.String({
          description: "Optional Pi thinking level: off, minimal, low, medium, high, xhigh, or max",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      const availableModels =
        context.scopedModels.length > 0
          ? context.scopedModels.map((entry) => entry.model)
          : context.modelRegistry.getAvailable();
      const requestedModel =
        params.model ??
        (context.model ? `${context.model.provider}/${context.model.id}` : undefined);
      if (!requestedModel) throw new Error("The parent Pi session has no active model");
      const model = resolveAvailableSubagentModel(requestedModel, availableModels);
      if (!model) {
        const names = availableModels.map((candidate) => `${candidate.provider}/${candidate.id}`);
        const available = [
          ...names.slice(0, 20),
          ...(names.length > 20 ? [`… and ${names.length - 20} more`] : []),
        ].join(", ");
        throw new Error(
          `Model ${requestedModel} is not available to the parent Pi session. Available models: ${available || "none"}`,
        );
      }
      const thinkingLevel = params.thinkingLevel ?? context.thinkingLevel;
      const piArguments = [
        "pi",
        "--model",
        model,
        ...(thinkingLevel ? ["--thinking", thinkingLevel] : []),
        "--",
        params.prompt,
      ];
      const result = await pi.exec(
        cli,
        [
          "--json",
          "subagents",
          "spawn",
          "--name",
          params.name,
          "--kind",
          "pi",
          "--",
          ...piArguments,
        ],
        { signal, timeout: 10_000 },
      );
      if (result.code !== 0)
        throw new Error(result.stderr || "Termarc could not spawn the subagent");
      const spawned = parseSpawnedSubagent(result.stdout);
      await watchers.watch(spawned.id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Spawned Termarc subagent ${params.name} (${spawned.id}). Waiting for its result-ready follow-up.`,
          },
        ],
        details: { id: spawned.id, name: params.name, model, thinkingLevel },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: "termarc_subagent_spawn_process",
    label: "Spawn Termarc Process",
    description:
      "Run a command as a generic process in a separate Termarc terminal. Use this, not Spawn Termarc Subagent, when asked to run a command directly (for example, npm run tauri build). The process has no Pi session or structured result; completion/output notifications are available through Control Termarc Subagents.",
    promptGuidelines: [
      "Use termarc_subagent_spawn_process for direct command requests such as npm run tauri build. Use termarc_subagent_spawn only when a separate Pi agent must reason about a prompt.",
      "After termarc_subagent_spawn_process succeeds, do not poll immediately; it ends the current tool loop and a completion follow-up will arrive automatically.",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Short label for the process terminal" }),
      command: Type.Array(Type.String(), {
        minItems: 1,
        description:
          'Executable and its arguments as separate values, for example ["npm", "run", "tauri", "build"]',
      }),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await pi.exec(
        cli,
        subagentProcessSpawnArguments(params.name, params.command),
        {
          signal,
          timeout: 10_000,
        },
      );
      if (result.code !== 0)
        throw new Error(result.stderr || "Termarc could not spawn the process");
      const spawned = parseSpawnedSubagent(result.stdout);
      await watchers.watch(spawned.id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Spawned Termarc process ${params.name} (${spawned.id}): ${params.command.join(" ")}. Waiting for its completion follow-up.`,
          },
        ],
        details: { id: spawned.id, name: params.name, command: params.command },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: "termarc_subagent",
    label: "Control Termarc Subagents",
    description:
      'Run the Termarc subagent CLI and return its output to this session. Call with arguments: ["skill"] for agent-oriented workflow guidance. Use ["result", id] for a clean Pi response; wait automatically returns when a result is already available. Use output only for diagnostics or generic processes.',
    promptSnippet: "Control Termarc subagents and retrieve their terminal output",
    promptGuidelines: [
      'Use termarc_subagent with arguments ["skill"] when you need the Termarc subagent workflow.',
      "When a Pi Termarc subagent completion triggers a parent turn, call termarc_subagent result directly. Do not call wait, status, or output first.",
    ],
    parameters: Type.Object({
      arguments: Type.Array(Type.String(), {
        minItems: 1,
        description: 'Arguments after "termarc subagents", such as ["output", "subagent-1"]',
      }),
      json: Type.Optional(
        Type.Boolean({ description: "Request structured JSON output from the Termarc CLI" }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const commandArguments = [...params.arguments];
      if (commandArguments[0] === "spawn") {
        throw new Error(
          "Use termarc_subagent_spawn for a Pi agent, or termarc_subagent_spawn_process to run a command directly",
        );
      }
      if (commandArguments[0] === "wait" && !commandArguments.includes("--result")) {
        commandArguments.push("--result");
      }
      const args = [...(params.json ? ["--json"] : []), "subagents", ...commandArguments];
      const result = await pi.exec(cli, args, {
        signal,
        timeout: SUBAGENT_WAIT_EXEC_TIMEOUT_MS,
      });
      if (result.code !== 0) throw new Error(result.stderr || "Termarc subagent command failed");
      return {
        content: [{ type: "text" as const, text: result.stdout || "(no output)" }],
        details: { arguments: params.arguments, json: params.json ?? false },
      };
    },
    renderResult(result, { expanded }, theme, context) {
      const args = context.args as { arguments?: string[] };
      const command = args.arguments?.[0] ?? "command";
      const id = args.arguments?.[1];
      const content = result.content.find((part) => part.type === "text");
      const text = content?.type === "text" ? content.text.trim() : "(no output)";
      if (expanded) return new Text(text, 0, 0);
      const firstLine = text.split("\n", 1)[0] ?? "";
      const preview = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
      const label =
        command === "result"
          ? `Result from ${id ?? "subagent"}`
          : [command, id].filter(Boolean).join(" ");
      return new Text(
        `${theme.fg("success", "✓")} ${theme.fg("toolTitle", label)}\n${theme.fg("muted", preview)}`,
        0,
        0,
      );
    },
  });

  // Pi awaits session_shutdown handlers. Waiting here guarantees that no task
  // owned by the old session can queue a completion after reload/session switch.
  pi.on("session_shutdown", async () => watchers.shutdown());
}
