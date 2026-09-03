import type { AgentKind, AgentState, TerminalLaunch } from "../types/terminal";

type PiState = AgentState | "stopped";

export const TERMARC_AGENT_OSC = 777;

export type TerminalAgentMarker = {
  agent: AgentKind;
  state: PiState;
};

export type TerminalShellMarker = {
  exitCode: number;
};

export type SubagentPiStateUpdate = {
  subagentId: string;
  terminalId: string;
  piState: PiState;
};

export function parseTerminalAgentMarker(data: string): TerminalAgentMarker | undefined {
  const [owner, agent, state, ...rest] = data.split(";");
  if (owner !== "termarc" || agent !== "pi" || rest.length > 0) return undefined;
  if (state === "processing" || state === "waiting" || state === "stopped") {
    return { agent, state };
  }
  return undefined;
}

export function subagentPiStateUpdate(
  terminalId: string,
  launch: TerminalLaunch,
  marker: TerminalAgentMarker,
): SubagentPiStateUpdate | undefined {
  if (marker.agent !== "pi" || launch.kind !== "subagent") return undefined;
  return { subagentId: launch.subagentId, terminalId, piState: marker.state };
}

export function parseTerminalShellMarker(data: string): TerminalShellMarker | undefined {
  const [owner, subject, exitCode, ...rest] = data.split(";");
  if (owner !== "termarc" || subject !== "shell" || rest.length > 0) return undefined;
  const parsed = Number(exitCode);
  return Number.isInteger(parsed) && parsed >= 0 ? { exitCode: parsed } : undefined;
}
