import type { ExternalEditor } from "./settings";

export type ProjectCommandMode = "single-shot" | "persistent";

export type ProjectCommandStorage = "global" | "project";

export type ProjectCommand = {
  id: string;
  name: string;
  command: string;
  mode: ProjectCommandMode;
  directory?: string;
  /** Stable display rank shared by app and project-local command stores. */
  order?: number;
  /** Where this command is saved. Project commands override globals with the same ID. */
  storage?: ProjectCommandStorage;
};

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
  /** Unmerged command lists, used to write each configuration store safely. */
  globalCommands?: ProjectCommand[];
  localCommands?: ProjectCommand[];
  localConfigError?: string;
  /** Shell terminals restored when Termarc starts. */
  terminals?: ProjectTerminal[];
};

export type ProjectTreeState = {
  projectOpen: boolean;
  terminalOpen: boolean;
  commandsOpen: boolean;
};

export type ProjectTreeProject = Project & ProjectTreeState;
