import type { AgentKind, AgentState } from "../types/terminal";

export const TERMARC_AGENT_OSC = 777;

const OSC_OWNERS = new Set(["termarc", "termdeck"]);

export type TerminalAgentMarker = {
  agent: AgentKind;
  state?: AgentState;
};

export type TerminalShellMarker = {
  exitCode: number;
};

export function parseTerminalAgentMarker(data: string): TerminalAgentMarker | undefined {
  const [owner, agent, state, ...rest] = data.split(";");
  if (!owner || !OSC_OWNERS.has(owner) || agent !== "pi" || rest.length > 0) return undefined;
  if (state === "processing" || state === "waiting") return { agent, state };
  if (state === "stopped") return { agent };
  return undefined;
}

export function parseTerminalShellMarker(data: string): TerminalShellMarker | undefined {
  const [owner, subject, exitCode, ...rest] = data.split(";");
  if (!owner || !OSC_OWNERS.has(owner) || subject !== "shell" || rest.length > 0) return undefined;
  const parsed = Number(exitCode);
  return Number.isInteger(parsed) && parsed >= 0 ? { exitCode: parsed } : undefined;
}
