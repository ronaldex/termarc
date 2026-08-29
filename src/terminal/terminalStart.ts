import type { PtyEvent, PtyStarted, TerminalStartResult } from "../types/terminal";

/**
 * Preserve lifecycle events delivered while the async start acknowledgement is
 * still in flight. Tauri channels may deliver an exit/error before invoke()
 * resolves, so the acknowledgement must not infer success from the session
 * object alone.
 */
export async function startWithTerminalEventRace(
  start: (onEvent: (event: PtyEvent) => void) => Promise<PtyStarted>,
  handleEvent: (event: PtyEvent, beforeStartResolved: boolean) => void,
): Promise<Exclude<TerminalStartResult, { outcome: "cancelled" }>> {
  let earlyOutcome: Extract<TerminalStartResult, { outcome: "exited" | "failed" }> | undefined;
  let startResolved = false;
  try {
    const session = await start((event) => {
      if (!startResolved) {
        // An error is terminal even if the backend subsequently emits exit as
        // part of tearing down the failed PTY.
        if (event.event === "error") {
          earlyOutcome = { outcome: "failed", error: event.message ?? "PTY error" };
        } else if (!earlyOutcome || earlyOutcome.outcome !== "failed") {
          earlyOutcome = { outcome: "exited", exitCode: event.exitCode ?? 0 };
        }
      }
      handleEvent(event, !startResolved);
    });
    startResolved = true;
    return earlyOutcome ?? { outcome: "running", session };
  } catch (error) {
    return { outcome: "failed", error: String(error) };
  }
}
