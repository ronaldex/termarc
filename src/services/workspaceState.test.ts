import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import {
  loadWorkspaceSelection,
  resolveWorkspaceSelection,
  saveWorkspaceSelection,
} from "./workspaceState";

function stubStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() {
      return values.size;
    },
  } satisfies Storage;
  vi.stubGlobal("localStorage", storage);
  return storage;
}

const project: Project = {
  id: "project-1",
  name: "Project",
  directory: "/project",
  terminals: [{ id: "terminal-1" }],
  commands: [{ id: "command-1", name: "Build", command: "npm run build" }],
  agents: [{ id: "agent-1", name: "Pi", command: "pi" }],
};

describe("workspace state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubStorage();
  });

  it("round trips a workspace selection", () => {
    const selection: SidebarSelection = {
      id: "terminal-1",
      kind: "terminal",
      projectId: "project-1",
      tabId: "terminal-1",
    };

    saveWorkspaceSelection(selection);

    expect(loadWorkspaceSelection()).toEqual(selection);
  });

  it("does not persist or restore runtime subagent selections", () => {
    const selection: SidebarSelection = {
      id: "subagent-terminal",
      kind: "subagent",
      projectId: project.id,
      tabId: "subagent-terminal",
      parentTerminalId: "terminal-1",
    };
    const stable: SidebarSelection = {
      id: project.id,
      kind: "project",
      projectId: project.id,
    };
    saveWorkspaceSelection(stable);

    saveWorkspaceSelection(selection);

    expect(loadWorkspaceSelection()).toEqual(stable);
    expect(
      resolveWorkspaceSelection(
        selection,
        [project],
        [{ id: selection.tabId, projectId: project.id }],
      ),
    ).toBeUndefined();
  });

  it("restores stable project pages", () => {
    const selection: SidebarSelection = {
      id: "project-1:commands",
      kind: "commands",
      projectId: "project-1",
    };

    expect(resolveWorkspaceSelection(selection, [project], [])).toEqual(selection);
  });

  it("restores terminals and process pages only while their targets exist", () => {
    const terminal: SidebarSelection = {
      id: "terminal-1",
      kind: "terminal",
      projectId: "project-1",
      tabId: "terminal-1",
    };
    const command: SidebarSelection = {
      id: "project-1:command:command-1",
      kind: "command",
      projectId: "project-1",
      commandId: "command-1",
    };

    expect(resolveWorkspaceSelection(terminal, [project], [])).toBeUndefined();
    expect(
      resolveWorkspaceSelection(
        terminal,
        [project],
        [{ id: "terminal-1", projectId: "project-1" }],
      ),
    ).toEqual(terminal);
    expect(resolveWorkspaceSelection(command, [project], [])).toEqual(command);
    expect(
      resolveWorkspaceSelection({ ...command, commandId: "missing" }, [project], []),
    ).toBeUndefined();
  });

  it("rejects malformed and transient modal state", () => {
    localStorage.setItem("termarc-workspace-state", JSON.stringify({ version: 1, selection: {} }));
    expect(loadWorkspaceSelection()).toBeUndefined();
    expect(
      resolveWorkspaceSelection(
        { id: "keyboard-shortcuts", kind: "keyboard-shortcuts" },
        [project],
        [],
      ),
    ).toBeUndefined();
  });
});
