import { describe, expect, it, vi } from "vitest";
import type { Project, ProjectCommand } from "../types/project";
import type { TerminalTab } from "../types/terminal";
import { useCommandRuns } from "./useCommandRuns";

const project: Project = {
  id: "project-1",
  name: "Project",
  directory: "/project",
};
const command: ProjectCommand = {
  id: "build",
  name: "Build",
  command: "npm run build",
};

function commandTab(projectId = project.id): TerminalTab {
  return {
    id: "terminal-1",
    projectId,
    cwd: "/old",
    currentCwd: "/old",
    customTitle: "Pinned build",
    launchTitle: "Old build",
    launch: {
      kind: "command",
      commandId: command.id,
      commandLine: "old command",
    },
  } as TerminalTab;
}

function setup(tabs: TerminalTab[] = []) {
  const createTab = vi.fn();
  const restartTab = vi.fn().mockResolvedValue(undefined);
  const stopTab = vi.fn().mockResolvedValue(undefined);
  const closeTab = vi.fn().mockResolvedValue(undefined);
  const runs = useCommandRuns({ tabs, createTab, restartTab, stopTab, closeTab });
  return { runs, createTab, restartTab, stopTab, closeTab };
}

describe("useCommandRuns", () => {
  it("scopes command runs by project and command ID", () => {
    const first = commandTab("project-1");
    const second = commandTab("project-2");
    const { runs } = setup([first, second]);

    expect(runs.find("project-2", command.id)).toBe(second);
  });

  it("updates an existing run from the latest command definition before restarting", async () => {
    const tab = commandTab();
    const { runs, restartTab } = setup([tab]);
    const updated = {
      ...command,
      name: "Build production",
      command: "npm run build -- --production",
      directory: "/project/frontend",
    };

    await runs.run(project, updated);

    expect(tab).toMatchObject({
      customTitle: "Pinned build",
      launchTitle: updated.name,
      cwd: updated.directory,
      currentCwd: updated.directory,
      launch: {
        kind: "command",
        commandId: updated.id,
        commandLine: updated.command,
      },
    });
    expect(restartTab).toHaveBeenCalledWith(tab);
  });

  it("uses a command label for new runs without treating it as a custom override", async () => {
    const { runs, createTab } = setup();

    await runs.run(project, command);

    expect(createTab).toHaveBeenCalledWith(project.id, project.directory, {
      launchTitle: command.name,
      launch: expect.objectContaining({ commandId: command.id }),
    });
  });

  it("restarts an existing agent run without creating a duplicate tab", async () => {
    const tab = commandTab();
    tab.launch = {
      kind: "command",
      commandId: command.id,
      commandLine: command.command,
      source: "agent",
    };
    const { runs, createTab, restartTab } = setup([tab]);

    await runs.run(project, command, "agent");

    expect(createTab).not.toHaveBeenCalled();
    expect(restartTab).toHaveBeenCalledWith(tab);
    expect(tab.launch).toMatchObject({ source: "agent", commandId: command.id });
  });

  it("keeps command and agent runs with the same ID separate", () => {
    const commandRun = commandTab();
    const agentRun = commandTab();
    agentRun.id = "agent-terminal";
    agentRun.launch = {
      kind: "command",
      commandId: command.id,
      commandLine: command.command,
      source: "agent",
    };
    const { runs } = setup([commandRun, agentRun]);

    expect(runs.find(project.id, command.id)).toBe(commandRun);
    expect(runs.find(project.id, command.id, "agent")).toBe(agentRun);
  });

  it("closes a run when its command is removed", async () => {
    const tab = commandTab();
    const { runs, closeTab } = setup([tab]);

    await runs.remove(project.id, command.id);

    expect(closeTab).toHaveBeenCalledWith(tab.id);
  });
});
