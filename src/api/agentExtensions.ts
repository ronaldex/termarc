import { invoke } from "@tauri-apps/api/core";

export type AgentExtensionId = "pi";

export interface AgentExtensionStatus {
  path: string;
  installed: boolean;
  current: boolean;
  updateAvailable: boolean;
  bundledVersion: string;
}

export interface AgentExtensionOption {
  id: AgentExtensionId;
  name: string;
  description: string;
  reloadHint: string;
}

export const AGENT_EXTENSION_OPTIONS: readonly AgentExtensionOption[] = [
  {
    id: "pi",
    name: "Pi",
    description:
      "Install the Termarc status extension so Pi can report when it is processing or waiting.",
    reloadHint: "Restart Pi or run /reload to activate it.",
  },
];

export function installAgentExtension(agent: AgentExtensionId): Promise<string> {
  return invoke("install_agent_extension", { agent });
}

export function getAgentExtensionStatus(agent: AgentExtensionId): Promise<AgentExtensionStatus> {
  return invoke("get_agent_extension_status", { agent });
}

export function isAgentExtensionInstalled(agent: AgentExtensionId): Promise<boolean> {
  return invoke("is_agent_extension_installed", { agent });
}

export function removeAgentExtension(agent: AgentExtensionId): Promise<string> {
  return invoke("remove_agent_extension", { agent });
}
