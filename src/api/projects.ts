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

export function loadLocalProjectCommands(directory: string): Promise<ProjectCommand[]> {
  return invoke("load_local_project_commands", { directory });
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
