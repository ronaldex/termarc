import { spawn } from "node:child_process";

export function assistantText(message: unknown): string | undefined {
  if (!message || typeof message !== "object" || !("role" in message)) return undefined;
  const candidate = message as {
    role?: string;
    content?: Array<{ type?: string; text?: unknown }>;
  };
  if (candidate.role !== "assistant" || !Array.isArray(candidate.content)) return undefined;
  // Any assistant message containing a tool call is an intermediate control
  // message, even when the model also emitted explanatory text around the call.
  if (candidate.content.some((part) => part.type === "toolCall")) return undefined;
  const text = candidate.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
  return text || undefined;
}

/**
 * Tracks only the last completed message in the current low-level run.
 * Tool results and empty/tool-only assistant messages deliberately clear older
 * assistant text so an intermediate response can never be published at settle.
 */
export class SettledResultCollector {
  private candidate: string | undefined;

  reset(): void {
    this.candidate = undefined;
  }

  observe(message: unknown): void {
    this.candidate = assistantText(message);
  }

  take(): string | undefined {
    const result = this.candidate;
    this.candidate = undefined;
    return result;
  }
}

const RESULT_SEQUENCE_STATE = Symbol.for("termarc.pi.result-sequence.v1");
type GlobalWithResultSequence = typeof globalThis & { [RESULT_SEQUENCE_STATE]?: number };

/** Returns a process-wide, restart-safe-enough monotonic wire sequence. */
export function nextResultMutationSequence(now = Date.now()): number {
  const target = globalThis as GlobalWithResultSequence;
  const candidate = now * 1_000;
  const sequence = Math.max(candidate, (target[RESULT_SEQUENCE_STATE] ?? 0) + 1);
  target[RESULT_SEQUENCE_STATE] = sequence;
  return sequence;
}

async function publishResultMutationOnce(
  cli: string,
  command: "report-result" | "clear-result",
  sequence: number,
  text?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cli, ["subagents", command, "--sequence", String(sequence)], {
      env: process.env,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let settled = false;
    let stderr = "";
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Termarc result reporting timed out"));
    }, 5_000);
    child.stderr.on("data", (data) => {
      if (stderr.length < 4_096) stderr += String(data);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) =>
      code === 0
        ? finish()
        : finish(new Error(stderr.trim() || `Termarc result reporting exited with code ${code}`)),
    );
    child.stdin.on("error", () => undefined);
    child.stdin.end(text);
  });
}

async function publishResultMutation(
  cli: string,
  command: "report-result" | "clear-result",
  sequence: number,
  text?: string,
): Promise<void> {
  let lastError: unknown;
  for (const delay of [0, 100, 300]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await publishResultMutationOnce(cli, command, sequence, text);
      return;
    } catch (error) {
      lastError = error;
      // A newer sequenced mutation already won the race, so this desired state
      // has deliberately been superseded and must not be retried.
      if (error instanceof Error && /not newer than|stale_result/.test(error.message)) return;
    }
  }
  throw lastError;
}

export async function publishSubagentProgress(cli: string, progress: unknown): Promise<void> {
  const text = JSON.stringify(progress);
  if (Buffer.byteLength(text, "utf8") > 24 * 1024) return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cli, ["subagents", "report-progress"], {
      env: process.env,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Termarc progress reporting timed out"));
    }, 5_000);
    child.stderr.on("data", (data) => {
      if (stderr.length < 4_096) stderr += String(data);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `progress reporter exited with code ${code}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(text);
  });
}

export function publishSubagentResult(
  cli: string,
  text: string,
  sequence = nextResultMutationSequence(),
): Promise<void> {
  return publishResultMutation(cli, "report-result", sequence, text);
}

export function clearSubagentResult(
  cli: string,
  sequence = nextResultMutationSequence(),
): Promise<void> {
  return publishResultMutation(cli, "clear-result", sequence);
}
