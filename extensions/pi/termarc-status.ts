import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  subagentPiSpawnArguments,
  subagentProcessSpawnArguments,
  parseSpawnedSubagent,
  SUBAGENT_WAIT_EXEC_TIMEOUT_MS,
} from "./termarc-status/cli";
import { termarcMainTerminalCli, termarcSubagentCli } from "./termarc-status/environment";
import { reportPiStatus } from "./termarc-status/osc";
import {
  clearSubagentResult,
  nextResultMutationSequence,
  publishSubagentProgress,
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
import type { SubagentResult as RenderedSubagentResult } from "./termarc-status/subagent/types";

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

function createSubagentParams(
  agentNames: string[],
  Type: {
    Object: (properties: Record<string, unknown>) => unknown;
    String: (options: unknown) => unknown;
    Optional: (value: unknown) => unknown;
  },
  StringEnum: (values: string[], options: unknown) => unknown,
) {
  return Type.Object({
    name: Type.String({
      description: "Short descriptive name for the spawned subterminal.",
    }),
    agent: StringEnum(agentNames, {
      description: `Exact configured agent profile to run. Available agents: ${agentNames.join(", ")}.`,
    }),
    task: Type.String({
      description:
        "The focused task for the subagent. Include the expected scope, decision boundary, and return shape.",
    }),
    cwd: Type.Optional(
      Type.String({
        description:
          "Working directory for the subagent. Relative paths resolve from the parent Pi working directory.",
      }),
    ),
  });
}

function resolveSubagentCwd(parentCwd: string, configuredCwd?: string): string {
  const candidate = configuredCwd?.trim()
    ? path.resolve(parentCwd, configuredCwd.trim())
    : parentCwd;
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new Error(`Subagent working directory does not exist: ${candidate}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Subagent working directory is not a directory: ${resolved}`);
  }
  return resolved;
}

function writeSystemPrompt(systemPrompt: string): { dir?: string; path?: string } {
  if (!systemPrompt.trim()) return {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termarc-subagent-"));
  const promptPath = path.join(dir, "system-prompt.md");
  fs.writeFileSync(promptPath, systemPrompt, { encoding: "utf8", mode: 0o600 });
  return { dir, path: promptPath };
}

function removeTempDir(dir?: string): void {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

function boundedProgress(result: RenderedSubagentResult): Record<string, unknown> {
  const lastMessage = result.messages.at(-1) as
    { role?: unknown; content?: Array<{ type?: unknown; text?: unknown }> } | undefined;
  const text = Array.isArray(lastMessage?.content)
    ? lastMessage.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("\n")
        .slice(-4_096)
    : "";
  return {
    ...result,
    messages: text ? [{ role: "assistant", content: [{ type: "text", text }] }] : [],
    stdoutTail: undefined,
    artifactDir: undefined,
    stdoutArtifact: undefined,
    stderrArtifact: undefined,
  };
}

function termarcResult(
  agent: string,
  task: string,
  cwd: string,
  text: string,
  emptyUsage: () => RenderedSubagentResult["usage"],
): RenderedSubagentResult {
  return {
    agent,
    agentSource: "unknown",
    cwd,
    task,
    exitCode: 0,
    messages: [{ role: "assistant", content: [{ type: "text", text }] }] as never,
    response: text,
    stderr: "",
    usage: emptyUsage(),
  };
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
  let childProgress: RenderedSubagentResult | undefined;
  let processPiEvent: ((event: unknown, result: RenderedSubagentResult) => boolean) | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let progressDirty = false;

  const publishProgressSoon = () => {
    if (!subagentCli || !childProgress) return;
    progressDirty = true;
    if (progressTimer) return;
    progressTimer = setTimeout(() => {
      progressTimer = undefined;
      if (!progressDirty || !childProgress) return;
      progressDirty = false;
      void publishSubagentProgress(subagentCli, boundedProgress(childProgress)).catch((error) =>
        console.error("Termarc could not publish Pi subagent progress:", error),
      );
    }, 100);
  };
  const observeChildProgress = (event: unknown) => {
    if (childProgress && processPiEvent?.(event, childProgress)) publishProgressSoon();
  };

  if (subagentCli) {
    pi.on("session_start", async (_event, context) => {
      const [{ processPiEvent: parseEvent }, { emptyUsage }] = await Promise.all([
        import("./termarc-status/subagent/runner-events"),
        import("./termarc-status/subagent/types"),
      ]);
      processPiEvent = parseEvent;
      childProgress = {
        agent: process.env.TERMARC_SUBAGENT_NAME || "subagent",
        agentSource: "unknown",
        cwd: context.cwd,
        task: "",
        exitCode: -1,
        messages: [],
        response: "",
        stderr: "",
        usage: emptyUsage(),
      };
      publishProgressSoon();
    });
    for (const eventName of [
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
      "tool_execution_start",
      "tool_execution_update",
      "tool_execution_end",
    ] as const) {
      pi.on(eventName, (event) => observeChildProgress(event));
    }
  }

  // Generic status reporting remains safe when this extension is global. OSC
  // emission itself is mode-gated, keeping JSON/print/RPC stdout pristine.
  pi.on("session_start", (_event, context) => {
    resultCollector.reset();
    reportPiStatus("waiting", context);
  });
  pi.on("agent_start", async (_event, context) => {
    resultCollector.reset();
    if (childProgress) {
      childProgress.exitCode = -1;
      childProgress.messages = [];
      childProgress.response = "";
      childProgress.stderr = "";
      childProgress.activities = [];
      childProgress.activityCount = 0;
      childProgress.toolExecutions = [];
      childProgress.toolExecutionCount = 0;
      childProgress.thinking = undefined;
      publishProgressSoon();
    }
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
    if (childProgress) {
      childProgress.exitCode = 0;
      childProgress.response = result ?? "";
      publishProgressSoon();
    }
    if (resultStatePublished) reportPiStatus("waiting", context);
  });
  pi.on("session_shutdown", (_event, context) => {
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = undefined;
    reportPiStatus("stopped", context);
  });

  const cli = termarcMainTerminalCli();
  const parentTerminalId = process.env.TERMARC_TERMINAL_ID;
  if (!cli || !parentTerminalId) return;

  const [
    { StringEnum },
    { Type },
    { Text },
    { discoverAgents },
    { renderSubagentCall, renderSubagentResult },
    { getResultSummaryText },
    { resolveSettings },
    { emptyUsage },
  ] = await Promise.all([
    import("@earendil-works/pi-ai"),
    import("typebox"),
    import("@earendil-works/pi-tui"),
    import("./termarc-status/subagent/agents"),
    import("./termarc-status/subagent/render"),
    import("./termarc-status/subagent/runner-events"),
    import("./termarc-status/subagent/settings"),
    import("./termarc-status/subagent/types"),
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

  const startupAgents = discoverAgents(process.cwd());
  if (startupAgents.agents.length > 0) {
    const agentNames = startupAgents.agents.map((agent) => agent.name);
    pi.registerTool({
      name: "subagent",
      label: "Subagent",
      description: [
        "Run one configured subagent on one focused task in a named, isolated Termarc subterminal.",
        `Available subagents: ${startupAgents.agents.map((agent) => `${agent.name}: ${agent.description}`).join("; ")}.`,
        "Set cwd when the subagent must run in a different project or Git worktree.",
        "Open the spawned Termarc terminal to inspect or interact with the full child session.",
      ].join(" "),
      promptSnippet: `Delegate one focused task to a Termarc subagent (${agentNames.join(", ")})`,
      promptGuidelines: [
        `Only call subagent with one of these exact configured agent names: ${agentNames.join(", ")}. Never guess or invent an agent name.`,
        "Give each spawned subterminal a short descriptive name for its task.",
        "Set subagent cwd to the target worktree root when delegating work in another worktree.",
        "For parallel work, call this tool multiple times in the same turn.",
      ],
      parameters: createSubagentParams(agentNames, Type, StringEnum),
      renderCall: renderSubagentCall,
      renderResult: renderSubagentResult,
      async execute(_toolCallId, params, signal, onUpdate, context) {
        const subterminalName = params.name.trim();
        if (!subterminalName) throw new Error("Subterminal name must not be empty");
        const cwd = resolveSubagentCwd(context.cwd, params.cwd);
        const discovery = discoverAgents(cwd);
        const agent = discovery.agents.find((candidate) => candidate.name === params.agent);
        if (!agent) throw new Error(`Unknown subagent \"${params.agent}\" for ${cwd}`);

        const settings = resolveSettings(cwd);
        const prompt = writeSystemPrompt(agent.systemPrompt);
        const model =
          agent.model ??
          settings.model ??
          (context.model ? `${context.model.provider}/${context.model.id}` : undefined);
        const piArguments = [
          "pi",
          ...(model ? ["--model", model] : []),
          ...(agent.thinking ? ["--thinking", agent.thinking] : []),
          ...(prompt.path ? ["--append-system-prompt", prompt.path] : []),
          ...(agent.skills ?? []).flatMap((skill) => ["--skill", skill]),
          "--",
          params.task,
        ];
        try {
          const spawnedResult = await pi.exec(
            cli,
            subagentPiSpawnArguments(subterminalName, piArguments),
            { signal, timeout: 10_000 },
          );
          if (spawnedResult.code !== 0) {
            throw new Error(spawnedResult.stderr || "Termarc could not spawn the subagent");
          }
          const spawned = parseSpawnedSubagent(spawnedResult.stdout);
          const running = {
            ...termarcResult(agent.name, params.task, cwd, "", emptyUsage),
            exitCode: -1,
          };
          onUpdate?.({
            content: [{ type: "text", text: "(running...)" }],
            details: { results: [running] },
          });

          while (true) {
            const waited = await pi.exec(
              cli,
              ["--json", "subagents", "wait", spawned.id, "--timeout", "300"],
              { signal, timeout: SUBAGENT_WAIT_EXEC_TIMEOUT_MS },
            );
            if (waited.code !== 0) throw new Error(waited.stderr || "Termarc subagent wait failed");
            const waitValue = JSON.parse(waited.stdout) as {
              timedOut?: unknown;
              status?: { resultAvailable?: unknown; lifecycle?: unknown; progress?: unknown };
            };
            const progress = waitValue.status?.progress;
            if (progress && typeof progress === "object" && !Array.isArray(progress)) {
              const snapshot = progress as Partial<RenderedSubagentResult>;
              const current = {
                ...termarcResult(agent.name, params.task, cwd, "", emptyUsage),
                ...snapshot,
                agent: agent.name,
                task: params.task,
                cwd,
                exitCode: -1,
              } as RenderedSubagentResult;
              onUpdate?.({
                content: [{ type: "text", text: "(running...)" }],
                details: { results: [current] },
              });
            }
            if (waitValue.status?.resultAvailable === true) break;
            if (waitValue.status?.lifecycle !== "running") {
              throw new Error("Termarc subagent exited without a structured result");
            }
          }
          const resultResponse = await pi.exec(cli, ["--json", "subagents", "result", spawned.id], {
            signal,
            timeout: 5_000,
          });
          if (resultResponse.code !== 0) {
            throw new Error(resultResponse.stderr || "Termarc subagent result was unavailable");
          }
          const resultValue = JSON.parse(resultResponse.stdout) as { text?: unknown };
          const text = typeof resultValue.text === "string" ? resultValue.text : "(no output)";
          const completed = termarcResult(agent.name, params.task, cwd, text, emptyUsage);
          return {
            content: [{ type: "text" as const, text: getResultSummaryText(completed) }],
            details: { results: [completed] },
          };
        } finally {
          removeTempDir(prompt.dir);
        }
      },
    });
  }

  pi.registerTool({
    name: "termarc_subagent_spawn_process",
    label: "Spawn Termarc Process",
    description:
      "Run a command as a generic process in a separate Termarc terminal. Use this, not Spawn Termarc Subagent, when asked to run a command directly (for example, npm run tauri build). The process has no Pi session or structured result; completion/output notifications are available through Control Termarc Subagents.",
    promptGuidelines: [
      "Use termarc_subagent_spawn_process for direct command requests such as npm run tauri build. Use subagent only when a separate Pi agent must reason about a prompt.",
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
      'Run the Termarc subagent CLI and return its output to this session. Call with arguments: ["skill"] for agent-oriented workflow guidance, ["close", id] to stop and close a child terminal, or ["result", id] for a clean Pi response. Wait automatically returns when a result is already available. Use output only for diagnostics or generic processes.',
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
          "Use subagent for a Pi agent, or termarc_subagent_spawn_process to run a command directly",
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
