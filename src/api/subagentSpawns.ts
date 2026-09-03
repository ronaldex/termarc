import { invoke } from "@tauri-apps/api/core";
import type { SubagentPiStateUpdate } from "../utils/terminalAgentStatus";

export type TopLevelTerminalMetadata = {
  terminalId: string;
  projectId: string;
};

export type SubagentSpawnRequest = {
  subagentId: string;
  parentTerminalId: string;
  projectId: string;
  name: string;
  command: string;
  cwd: string;
  processKind: string;
};

export type SubagentSpawnAcknowledgement = {
  subagentId: string;
  success: boolean;
  error?: string;
};

export type SubagentCloseRequest = {
  subagentId: string;
  terminalId: string;
};

export function registerTopLevelTerminals(terminals: TopLevelTerminalMetadata[]): Promise<void> {
  return invoke("register_top_level_terminals", { terminals });
}

export function acknowledgeSubagentSpawn(
  acknowledgement: SubagentSpawnAcknowledgement,
): Promise<void> {
  return invoke("acknowledge_subagent_spawn", { acknowledgement });
}

export function updateSubagentPiState(update: SubagentPiStateUpdate): Promise<void> {
  return invoke("update_subagent_pi_state", { update });
}

export function detachSubagents(parentTerminalId: string, subagentIds: string[]): Promise<void> {
  return invoke("detach_subagents", { parentTerminalId, subagentIds });
}
