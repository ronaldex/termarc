import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type PiState = "processing" | "waiting" | "stopped";
export type SubagentLifecycle = "running" | "exited" | "stopped" | "error";

export type SubagentStatus = {
  id: string;
  name: string;
  lifecycle: SubagentLifecycle;
  piState?: PiState;
  resultAvailable: boolean;
  resultUpdatedAt?: number;
};

export type SubagentWait = { timedOut: boolean; status: SubagentStatus };
export type SubagentListPage = { items: SubagentStatus[]; nextCursor?: string };
export type SubagentOutput = {
  format: "raw" | "plain";
  after: number;
  cursor: number;
  truncated: boolean;
  data: number[];
};
export type SubagentResult = { id: string; text: string; updatedAt: number };
export type ControlError = { code: string; message: string };
export type ControlResponse =
  | { ok: true; protocolVersion: 1; result: unknown }
  | { ok: false; protocolVersion: 1; error: ControlError };

export const CONTROL_PROTOCOL_VERSION = 1 as const;

// The CLI owns protocol timeout conversion and the backend owns wait semantics.
// Extension callers use this one deadline only to allow process teardown slack.
export const SUBAGENT_WAIT_SECONDS = 300;
export const SUBAGENT_WAIT_EXEC_TIMEOUT_MS = (SUBAGENT_WAIT_SECONDS + 5) * 1_000;

const SUBAGENT_LIST_PAGE_LIMIT = 64;

export function subagentListArguments(parentTerminalId: string, cursor?: string): string[] {
  return [
    "--json",
    "subagents",
    "list",
    "--parent",
    parentTerminalId,
    "--limit",
    String(SUBAGENT_LIST_PAGE_LIMIT),
    ...(cursor === undefined ? [] : ["--cursor", cursor]),
  ];
}

export function subagentWaitArguments(id: string, returnOnResult = true): string[] {
  return [
    "--json",
    "subagents",
    "wait",
    id,
    ...(returnOnResult ? ["--result"] : []),
    "--timeout",
    String(SUBAGENT_WAIT_SECONDS),
  ];
}

export function subagentCloseArguments(id: string): string[] {
  return ["--json", "subagents", "close", id];
}

export function isDirectSubagentResultCommand(
  commandArguments: readonly string[],
): commandArguments is readonly ["result", string] {
  return (
    commandArguments.length === 2 &&
    commandArguments[0] === "result" &&
    commandArguments[1].length > 0
  );
}

export function shouldAutoCloseDirectResult(
  commandArguments: readonly string[],
  keepOpen = false,
): boolean {
  return !keepOpen && isDirectSubagentResultCommand(commandArguments);
}

export type ConsumedSubagentResult<T> = {
  result: T;
  retention:
    | { status: "closed"; id: string }
    | { status: "kept-open"; id: string }
    | { status: "close-failed"; id: string; error: string };
};

export async function autoCloseConsumedSubagent<T>(
  pi: Pick<ExtensionAPI, "exec">,
  cli: string,
  id: string,
  result: T,
  keepOpen = false,
  signal?: AbortSignal,
): Promise<ConsumedSubagentResult<T>> {
  if (keepOpen) return { result, retention: { status: "kept-open", id } };

  try {
    const closed = await pi.exec(cli, subagentCloseArguments(id), { signal, timeout: 5_000 });
    if (closed.code !== 0) {
      return {
        result,
        retention: {
          status: "close-failed",
          id,
          error: closed.stderr || "Termarc subagent close failed",
        },
      };
    }
    return { result, retention: { status: "closed", id } };
  } catch (error) {
    return {
      result,
      retention: {
        status: "close-failed",
        id,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function subagentPiSpawnArguments(name: string, piArguments: string[]): string[] {
  return ["--json", "subagents", "spawn", "--name", name, "--kind", "pi", "--", ...piArguments];
}

export function subagentProcessSpawnArguments(name: string, command: string[]): string[] {
  return ["--json", "subagents", "spawn", "--name", name, "--kind", "process", "--", ...command];
}

function record(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Termarc returned malformed ${description}`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Termarc returned malformed ${field}`);
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Termarc returned malformed ${field}`);
  }
  return value;
}

export function parseSubagentStatus(value: unknown): SubagentStatus {
  const status = record(value, "subagent status");
  const id = optionalString(status.id, "subagent id");
  const name = optionalString(status.name, "subagent name");
  const lifecycle = optionalString(status.lifecycle, "subagent lifecycle");
  if (!id || !name || !["running", "exited", "stopped", "error"].includes(lifecycle ?? "")) {
    throw new Error("Termarc returned malformed subagent status");
  }
  const piState = optionalString(status.piState, "Pi state");
  if (piState !== undefined && !["processing", "waiting", "stopped"].includes(piState)) {
    throw new Error("Termarc returned malformed Pi state");
  }
  if (status.resultAvailable !== undefined && typeof status.resultAvailable !== "boolean") {
    throw new Error("Termarc returned malformed result availability");
  }
  return {
    id,
    name,
    lifecycle: lifecycle as SubagentLifecycle,
    piState: piState as PiState | undefined,
    // Older protocol-v1 payloads omitted the field; absence means unavailable.
    resultAvailable: status.resultAvailable === true,
    resultUpdatedAt: optionalNumber(status.resultUpdatedAt, "result timestamp"),
  };
}

export function parseSubagentList(output: string): SubagentStatus[] {
  const value = parseJson(output, "listing subagents");
  if (!Array.isArray(value)) throw new Error("Termarc returned malformed subagent list");
  return value.map(parseSubagentStatus);
}

export function parseSubagentListPage(output: string): SubagentListPage {
  const value = parseJson(output, "listing subagents");
  // Accept an unpaged protocol-v1 CLI during a rolling extension/app update.
  if (Array.isArray(value)) return { items: value.map(parseSubagentStatus) };
  const page = record(value, "subagent list page");
  if (!Array.isArray(page.items)) throw new Error("Termarc returned malformed subagent list page");
  const nextCursor = optionalString(page.nextCursor, "subagent list cursor");
  if (nextCursor === "") throw new Error("Termarc returned malformed subagent list cursor");
  return { items: page.items.map(parseSubagentStatus), nextCursor };
}

export function parseSubagentWait(output: string): SubagentWait {
  const value = record(parseJson(output, "waiting for a subagent"), "subagent wait response");
  if (typeof value.timedOut !== "boolean") {
    throw new Error("Termarc returned malformed subagent wait timeout");
  }
  return { timedOut: value.timedOut, status: parseSubagentStatus(value.status) };
}

export function parseSpawnedSubagent(output: string): { id: string } {
  const value = record(parseJson(output, "spawning a subagent"), "spawn response");
  if (typeof value.id !== "string" || !value.id) {
    throw new Error("Termarc returned malformed spawn response");
  }
  return { id: value.id };
}

export function parseSubagentOutput(value: unknown): SubagentOutput {
  const output = record(value, "subagent output");
  const format = optionalString(output.format, "output format");
  if (
    !["raw", "plain"].includes(format ?? "") ||
    typeof output.after !== "number" ||
    typeof output.cursor !== "number" ||
    typeof output.truncated !== "boolean" ||
    !Array.isArray(output.data) ||
    !output.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("Termarc returned malformed subagent output");
  }
  return {
    format: format as "raw" | "plain",
    after: output.after,
    cursor: output.cursor,
    truncated: output.truncated,
    data: output.data as number[],
  };
}

export function parseSubagentResult(value: unknown): SubagentResult {
  const result = record(value, "subagent result");
  if (
    typeof result.id !== "string" ||
    !result.id ||
    typeof result.text !== "string" ||
    typeof result.updatedAt !== "number" ||
    !Number.isFinite(result.updatedAt)
  ) {
    throw new Error("Termarc returned malformed subagent result");
  }
  return { id: result.id, text: result.text, updatedAt: result.updatedAt };
}

export function parseEmptyResponse(value: unknown): Record<string, never> {
  const response = record(value, "empty response");
  if (Object.keys(response).length !== 0)
    throw new Error("Termarc returned malformed empty response");
  return {};
}

export function parseControlResponse(value: unknown): ControlResponse {
  const response = record(value, "control response");
  if (response.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
    throw new Error(
      `Termarc returned unsupported protocol version ${String(response.protocolVersion)}`,
    );
  }
  if (response.ok === true && "result" in response && response.error === undefined) {
    return { ok: true, protocolVersion: CONTROL_PROTOCOL_VERSION, result: response.result };
  }
  if (response.ok === false && response.result === undefined) {
    const error = record(response.error, "control error");
    if (typeof error.code === "string" && error.code && typeof error.message === "string") {
      return {
        ok: false,
        protocolVersion: CONTROL_PROTOCOL_VERSION,
        error: { code: error.code, message: error.message },
      };
    }
  }
  throw new Error("Termarc returned malformed control response");
}

function parseJson(output: string, description: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`Termarc returned invalid JSON while ${description}`);
  }
}

export async function listSubagents(
  pi: ExtensionAPI,
  cli: string,
  parentTerminalId: string,
  signal?: AbortSignal,
): Promise<SubagentStatus[]> {
  const statuses: SubagentStatus[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await pi.exec(cli, subagentListArguments(parentTerminalId, cursor), {
      signal,
      timeout: 5_000,
    });
    if (result.code !== 0) throw new Error(result.stderr || "Termarc list failed");
    const page = parseSubagentListPage(result.stdout);
    statuses.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== undefined && seenCursors.has(cursor)) {
      throw new Error("Termarc returned a repeated subagent list cursor");
    }
    if (cursor !== undefined) seenCursors.add(cursor);
  } while (cursor !== undefined);
  return statuses;
}
