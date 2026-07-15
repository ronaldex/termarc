export type ProjectCommandMode = "single-shot" | "persistent";

export type ProjectCommand = {
  id: string;
  name: string;
  command: string;
  mode: ProjectCommandMode;
  directory?: string;
};

export type Project = {
  id: string;
  name: string;
  directory: string;
  commands?: ProjectCommand[];
};

export type ProjectTreeState = {
  terminalOpen: boolean;
  commandsOpen: boolean;
};

export type ProjectTreeProject = Project & ProjectTreeState;
