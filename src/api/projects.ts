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

export function saveLocalProjectCommands(
  directory: string,
  commands: ProjectCommand[],
): Promise<void> {
  return invoke("save_local_project_commands", { directory, commands });
}
