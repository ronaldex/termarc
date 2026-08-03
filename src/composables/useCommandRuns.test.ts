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
  mode: "single-shot",
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
      mode: "single-shot",
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
        mode: updated.mode,
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

  it("closes a run when its command is removed", async () => {
    const tab = commandTab();
    const { runs, closeTab } = setup([tab]);

    await runs.remove(project.id, command.id);

    expect(closeTab).toHaveBeenCalledWith(tab.id);
  });
});
