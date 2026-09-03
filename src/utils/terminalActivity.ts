import type { PtyStatus, TerminalTab } from "../types/terminal";
import type { TerminalAgentMarker } from "./terminalAgentStatus";

export type TerminalActivityState = Pick<
  TerminalTab,
  "processName" | "agent" | "agentState" | "currentCwd"
>;

export type AgentMarkerUpdate = {
  activity: TerminalActivityState;
  becameReady: boolean;
};

/**
 * Merge a polled process snapshot without allowing process discovery to erase
 * an authoritative OSC processing/waiting state.
 */
export function applyProcessSnapshot(
  current: TerminalActivityState,
  snapshot: PtyStatus,
  fallbackCwd: string,
): TerminalActivityState {
  return {
    ...current,
    processName: snapshot.processName || undefined,
    agent: current.agentState ? current.agent : snapshot.agent || undefined,
    currentCwd: snapshot.cwd || current.currentCwd || fallbackCwd,
  };
}

/** Apply an OSC agent marker and report the single transition that may notify. */
export function applyAgentMarker(
  current: TerminalActivityState,
  marker: TerminalAgentMarker,
): AgentMarkerUpdate {
  const becameReady =
    marker.state === "waiting" &&
    current.agent === marker.agent &&
    current.agentState === "processing";

  const state = marker.state === "stopped" ? undefined : marker.state;
  return {
    activity: {
      ...current,
      agent: state ? marker.agent : undefined,
      agentState: state,
    },
    becameReady,
  };
}
