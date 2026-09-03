import { invoke } from "@tauri-apps/api/core";
import type { Project, ProjectCommand, ProjectTreeState } from "../types/project";

export function loadProjects(): Promise<Project[]> {
  return invoke<Project[]>("load_projects");
}

export function saveProjects(projects: Project[]): Promise<void> {
  return invoke("save_projects", { projects });
}

export function loadProjectTreeState(): Promise<Record<string, ProjectTreeState>> {
  return invoke("load_project_tree_state");
}

export function saveProjectTreeState(state: Record<string, ProjectTreeState>): Promise<void> {
  return invoke("save_project_tree_state", { state });
}

export type LocalProjectConfig = {
  commands: ProjectCommand[];
  agents: ProjectCommand[];
};

export function loadLocalProjectConfig(directory: string): Promise<LocalProjectConfig> {
  return invoke("load_local_project_config", { directory });
}

export async function loadLocalProjectCommands(directory: string): Promise<ProjectCommand[]> {
  return (await loadLocalProjectConfig(directory)).commands;
}

export function saveLocalProjectAgents(directory: string, agents: ProjectCommand[]): Promise<void> {
  return invoke("save_local_project_agents", { directory, agents });
}

export function saveLocalProjectCommands(
  directory: string,
  commands: ProjectCommand[],
): Promise<void> {
  return invoke("save_local_project_commands", { directory, commands });
}

export type CommandOrderFailure = {
  stage: "validation" | "global" | "local" | "rollback" | "lock";
  message: string;
};

export function saveProjectCommandOrder(
  projectId: string,
  directory: string,
  globalCommands: ProjectCommand[],
  localCommands: ProjectCommand[],
): Promise<void> {
  return invoke("save_project_command_order", {
    projectId,
    directory,
    globalCommands,
    localCommands,
  });
}

export function saveProjectAgentOrder(
  projectId: string,
  directory: string,
  globalAgents: ProjectCommand[],
  localAgents: ProjectCommand[],
): Promise<void> {
  return invoke("save_project_agent_order", {
    projectId,
    directory,
    globalAgents,
    localAgents,
  });
}
