import type { Project, ProjectCommand } from "../types/project";
import type { TerminalTab } from "../types/terminal";

export type CommandRunDependencies = {
  tabs: TerminalTab[];
  createTab: (
    projectId: string,
    cwd: string,
    options: {
      name: string;
      launch: {
        kind: "command";
        commandId: string;
        commandLine: string;
        mode: ProjectCommand["mode"];
      };
    },
  ) => Promise<TerminalTab | undefined>;
  restartTab: (tab: TerminalTab) => Promise<void>;
  stopTab: (tab: TerminalTab) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
};

export function isCommandRun(
  tab: Pick<TerminalTab, "projectId" | "launch">,
  projectId: string,
  commandId: string,
): boolean {
  return (
    tab.projectId === projectId &&
    tab.launch.kind === "command" &&
    tab.launch.commandId === commandId
  );
}

export function useCommandRuns({
  tabs,
  createTab,
  restartTab,
  stopTab,
  closeTab,
}: CommandRunDependencies) {
  function find(projectId: string, commandId: string): TerminalTab | undefined {
    return tabs.find((tab) => isCommandRun(tab, projectId, commandId));
  }

  async function run(project: Project, command: ProjectCommand): Promise<TerminalTab | undefined> {
    const cwd = command.directory ?? project.directory;
    const launch = {
      kind: "command" as const,
      commandId: command.id,
      commandLine: command.command,
      mode: command.mode,
    };
    const existing = find(project.id, command.id);
    if (!existing) return createTab(project.id, cwd, { name: command.name, launch });

    existing.cwd = cwd;
    existing.currentCwd = cwd;
    existing.name = command.name;
    existing.launch = launch;
    await restartTab(existing);
    return existing;
  }

  async function stop(projectId: string, commandId: string): Promise<void> {
    const tab = find(projectId, commandId);
    if (tab) await stopTab(tab);
  }

  async function remove(projectId: string, commandId: string): Promise<void> {
    const tab = find(projectId, commandId);
    if (tab) await closeTab(tab.id);
  }

  return { find, run, stop, remove };
}
