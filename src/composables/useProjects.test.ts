import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectCommand } from "../types/project";

const api = vi.hoisted(() => ({
  loadProjects: vi.fn(),
  loadProjectTreeState: vi.fn(),
  saveProjectTreeState: vi.fn(),
  loadLocalProjectConfig: vi.fn(),
  saveLocalProjectAgents: vi.fn(),
  saveLocalProjectCommands: vi.fn(),
  saveProjectCommandOrder: vi.fn(),
  saveProjects: vi.fn(),
}));

vi.mock("../api/projects", () => api);

import { useProjects } from "./useProjects";

const storedProject: Project = {
  id: "project-1",
  name: "Project",
  directory: "/project",
  commands: [],
  agents: [],
  globalCommands: [],
  localCommands: [],
  globalAgents: [],
  localAgents: [],
  terminals: [],
};

const agent: ProjectCommand = {
  id: "agent-pi",
  name: "Pi",
  command: "pi",
  autostart: true,
  autoRestart: { maxRetries: 3, retryWindowSeconds: 60 },
};

describe("useProjects agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", globalThis);
    api.loadProjects.mockResolvedValue([{ ...storedProject }]);
    api.loadProjectTreeState.mockResolvedValue({});
    api.loadLocalProjectConfig.mockResolvedValue({ commands: [], agents: [] });
    api.saveLocalProjectAgents.mockResolvedValue(undefined);
    api.saveLocalProjectCommands.mockResolvedValue(undefined);
    api.saveProjects.mockResolvedValue(undefined);
    api.saveProjectTreeState.mockResolvedValue(undefined);
  });

  it("adds a global agent to live state and the global project snapshot", async () => {
    const state = useProjects();
    await state.load();
    const project = state.projects.value[0]!;

    await state.saveAgent({ ...project, agents: [{ ...agent, storage: "global" }] }, agent.id);

    expect(project.agents).toEqual([{ ...agent, storage: "global" }]);
    expect(project.globalAgents).toEqual([{ ...agent, storage: "global" }]);
    expect(project.localAgents).toEqual([]);

    await state.flushPersistence();
    expect(api.saveProjects).toHaveBeenLastCalledWith([
      expect.objectContaining({ agents: [agent] }),
    ]);
  });

  it("adds a project-local agent without putting it in the global snapshot", async () => {
    const state = useProjects();
    await state.load();
    const project = state.projects.value[0]!;
    const localAgent = { ...agent, storage: "project" as const };

    await state.saveAgent({ ...project, agents: [localAgent] }, agent.id);

    expect(api.saveLocalProjectAgents).toHaveBeenCalledWith("/project", [localAgent]);
    expect(project.agents).toEqual([localAgent]);
    expect(project.globalAgents).toEqual([]);
    expect(project.localAgents).toEqual([localAgent]);

    await state.flushPersistence();
    expect(api.saveProjects).toHaveBeenLastCalledWith([expect.objectContaining({ agents: [] })]);
  });

  it("retains a local agent when moving it to global storage fails", async () => {
    const localAgent = { ...agent, storage: "project" as const };
    api.loadProjects.mockResolvedValue([
      {
        ...storedProject,
        agents: [localAgent],
        localAgents: [localAgent],
      },
    ]);
    api.saveProjects.mockRejectedValueOnce(new Error("global write failed"));
    const state = useProjects();
    await state.load();
    const project = state.projects.value[0]!;

    await expect(
      state.saveAgent({ ...project, agents: [{ ...agent, storage: "global" }] }, agent.id),
    ).rejects.toThrow("global write failed");

    expect(api.saveLocalProjectAgents).not.toHaveBeenCalled();
    expect(project.agents).toEqual([localAgent]);
    expect(project.localAgents).toEqual([localAgent]);
  });

  it("replaces local agents when the project directory changes", async () => {
    const oldAgent = { ...agent, id: "old", storage: "project" as const };
    const newAgent = { ...agent, id: "new", storage: "project" as const };
    api.loadProjects.mockResolvedValue([
      {
        ...storedProject,
        agents: [oldAgent],
        localAgents: [oldAgent],
      },
    ]);
    api.loadLocalProjectConfig.mockResolvedValue({ commands: [], agents: [newAgent] });
    const state = useProjects();
    await state.load();

    await state.update({
      id: "project-1",
      name: "Project",
      directory: "/other-project",
      externalEditor: undefined,
    });

    expect(state.projects.value[0]?.agents).toEqual([{ ...newAgent, order: 0 }]);
    expect(state.projects.value[0]?.localAgents).toEqual([{ ...newAgent, order: 0 }]);
  });
});
