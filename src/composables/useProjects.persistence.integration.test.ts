import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types/project";

const storage = vi.hoisted(() => ({ projects: "[]", tree: "{}" }));
const invoke = vi.hoisted(() =>
  vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === "load_projects") return JSON.parse(storage.projects);
    if (command === "save_projects") {
      storage.projects = JSON.stringify(payload?.projects);
      return;
    }
    if (command === "load_project_tree_state") return JSON.parse(storage.tree);
    if (command === "save_project_tree_state") {
      storage.tree = JSON.stringify(payload?.state);
      return;
    }
    throw new Error(`Unexpected Tauri command: ${command}`);
  }),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useProjects } from "./useProjects";

function serializedProjects(): Project[] {
  return [
    {
      id: "project-a",
      name: "A",
      directory: "/a",
      commands: [],
      terminals: [
        { id: "root" },
        { id: "child", parentTerminalId: "root" },
        { id: "too-deep", parentTerminalId: "child" },
        { id: "stale", parentTerminalId: "missing" },
        { id: "cycle-a", parentTerminalId: "cycle-b" },
        { id: "cycle-b", parentTerminalId: "cycle-a" },
      ],
    },
    {
      id: "project-b",
      name: "B",
      directory: "/b",
      commands: [],
      terminals: [{ id: "cross-project", parentTerminalId: "root" }],
    },
  ];
}

describe("project persistence API integration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", globalThis);
    storage.projects = JSON.stringify(serializedProjects());
    storage.tree = "{}";
  });

  it("serializes, stores, reloads, and normalizes invalid parent graphs into live state", async () => {
    const first = useProjects();
    await first.load();

    // Cross the saveProjects API wrapper and its serialization boundary, rather
    // than feeding a normalized object directly into a second composable.
    first.setProjectTerminals("project-a", serializedProjects()[0]!.terminals!);
    first.setProjectTerminals("project-b", serializedProjects()[1]!.terminals!);
    await first.flushPersistence();
    expect(invoke).toHaveBeenCalledWith("save_projects", { projects: expect.any(Array) });

    const persisted = JSON.parse(storage.projects) as Project[];
    expect(persisted[0]!.terminals).toEqual([
      { id: "root" },
      { id: "child", parentTerminalId: "root" },
      { id: "too-deep" },
      { id: "stale" },
      { id: "cycle-a" },
      { id: "cycle-b" },
    ]);
    expect(persisted[1]!.terminals).toEqual([{ id: "cross-project" }]);

    const reloaded = useProjects();
    await reloaded.load();
    expect(reloaded.projects.value.map((project) => project.terminals)).toEqual([
      persisted[0]!.terminals,
      persisted[1]!.terminals,
    ]);
    expect(
      reloaded.projects.value.flatMap((project) =>
        (project.terminals ?? []).filter((terminal) => terminal.parentTerminalId),
      ),
    ).toEqual([{ id: "child", parentTerminalId: "root" }]);
  });
});
