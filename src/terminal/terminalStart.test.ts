import { describe, expect, it } from "vitest";
import type { PtyEvent } from "../types/terminal";
import { startWithTerminalEventRace } from "./terminalStart";

const session = { id: "pty-1", pid: 42, shell: "/bin/zsh" };

describe("terminal start event races", () => {
  it("preserves a normal exit delivered before start resolves", async () => {
    const seen: PtyEvent[] = [];
    const result = await startWithTerminalEventRace(
      async (onEvent) => {
        onEvent({ event: "exit", exitCode: 0 });
        return session;
      },
      (event) => seen.push(event),
    );

    expect(result).toEqual({ outcome: "exited", exitCode: 0 });
    expect(seen).toEqual([{ event: "exit", exitCode: 0 }]);
  });

  it("does not turn an early PTY error into a successful start", async () => {
    const result = await startWithTerminalEventRace(
      async (onEvent) => {
        onEvent({ event: "error", message: "reader setup failed" });
        await Promise.resolve();
        return session;
      },
      () => undefined,
    );

    expect(result).toEqual({ outcome: "failed", error: "reader setup failed" });
  });

  it("keeps an early error failed when teardown emits exit before start resolves", async () => {
    const result = await startWithTerminalEventRace(
      async (onEvent) => {
        onEvent({ event: "error", message: "reader setup failed" });
        onEvent({ event: "exit", exitCode: 0 });
        return session;
      },
      () => undefined,
    );

    expect(result).toEqual({ outcome: "failed", error: "reader setup failed" });
  });

  it("treats an error after an early exit as a failed start", async () => {
    const result = await startWithTerminalEventRace(
      async (onEvent) => {
        onEvent({ event: "exit", exitCode: 1 });
        onEvent({ event: "error", message: "PTY closed unexpectedly" });
        return session;
      },
      () => undefined,
    );

    expect(result).toEqual({ outcome: "failed", error: "PTY closed unexpectedly" });
  });

  it("returns running only when no lifecycle event wins the race", async () => {
    await expect(
      startWithTerminalEventRace(
        async () => session,
        () => undefined,
      ),
    ).resolves.toEqual({ outcome: "running", session });
  });
});
