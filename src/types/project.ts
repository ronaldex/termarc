import type { ExternalEditor } from "./settings";

export type ProjectCommandStorage = "global" | "project";

export type AutoRestartPolicy = {
  maxRetries: number;
  retryWindowSeconds: number;
};

export type ProjectCommand = {
  id: string;
  name: string;
  command: string;
  directory?: string;
  /** Stable display rank shared by app and project-local command stores. */
  order?: number;
  /** Where this command is saved. Project commands override globals with the same ID. */
  storage?: ProjectCommandStorage;
  /** Start this process when the project start action runs. */
  autostart?: boolean;
  /** Restart after unexpected exits, bounded by this retry policy. */
  autoRestart?: AutoRestartPolicy;
};

/** Agents use the same launch configuration and lifecycle as commands. */
export type ProjectAgent = ProjectCommand;

export type ProjectTerminal = {
  /** Stable identity used to restore terminal ordering across launches. */
  id: string;
  customTitle?: string;
};

export type ProjectMetadataUpdate = Pick<Project, "id" | "name" | "directory" | "externalEditor">;

export type Project = {
  id: string;
  name: string;
  directory: string;
  externalEditor?: ExternalEditor;
  commands?: ProjectCommand[];
  agents?: ProjectAgent[];
  /** Unmerged command lists, used to write each configuration store safely. */
  globalCommands?: ProjectCommand[];
  localCommands?: ProjectCommand[];
  globalAgents?: ProjectAgent[];
  localAgents?: ProjectAgent[];
  localConfigError?: string;
  /** Shell terminals restored when Termarc starts. */
  terminals?: ProjectTerminal[];
};

export type ProjectTreeState = {
  projectOpen: boolean;
  terminalOpen: boolean;
  commandsOpen: boolean;
  agentsOpen?: boolean;
};

export type ProjectTreeProject = Project & ProjectTreeState;
