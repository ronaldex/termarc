import { describe, expect, it } from "vitest";
import type { TerminalActivityState } from "./terminalActivity";
import { applyAgentMarker, applyProcessSnapshot } from "./terminalActivity";

const idle: TerminalActivityState = {
  currentCwd: "/workspace",
};

describe("terminal activity updates", () => {
  it("applies process activity and preserves the last known cwd", () => {
    expect(applyProcessSnapshot(idle, { processName: "node", agent: "pi" }, "/fallback")).toEqual({
      currentCwd: "/workspace",
      processName: "node",
      agent: "pi",
    });
  });

  it("does not let polling erase an authoritative OSC state", () => {
    const processing: TerminalActivityState = {
      processName: "node",
      agent: "pi",
      agentState: "processing",
      currentCwd: "/workspace",
    };

    expect(applyProcessSnapshot(processing, { cwd: "/next" }, "/fallback")).toEqual({
      processName: undefined,
      agent: "pi",
      agentState: "processing",
      currentCwd: "/next",
    });
  });

  it("reports only the processing to waiting transition as ready", () => {
    const processing = applyAgentMarker(idle, { agent: "pi", state: "processing" });
    expect(processing.becameReady).toBe(false);

    const waiting = applyAgentMarker(processing.activity, { agent: "pi", state: "waiting" });
    expect(waiting.becameReady).toBe(true);
    expect(applyAgentMarker(waiting.activity, { agent: "pi", state: "waiting" }).becameReady).toBe(
      false,
    );
  });

  it("clears authoritative agent state on a stopped marker", () => {
    const stopped = applyAgentMarker(
      { ...idle, agent: "pi", agentState: "waiting" },
      { agent: "pi" },
    );

    expect(stopped.activity.agent).toBeUndefined();
    expect(stopped.activity.agentState).toBeUndefined();
  });
});
