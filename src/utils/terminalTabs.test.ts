import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import {
  adjacentTabId,
  nextProjectTerminalId,
  projectTerminalIds,
  terminalShortcutOrder,
} from "./terminalTabs";

function terminal(id: string, projectId: string, kind: "shell" | "command" = "shell") {
  return {
    id,
    projectId,
    launch:
      kind === "shell"
        ? { kind: "shell" as const }
        : { kind: "command" as const, commandId: `command-${id}` },
  } as TerminalTabState;
}

describe("terminal tab navigation", () => {
  it("orders shortcuts by their top-to-bottom project tree position", () => {
    const tabs = [
      terminal("project-b-1", "project-b"),
      terminal("project-a-1", "project-a"),
      terminal("project-a-command", "project-a", "command"),
      terminal("project-a-2", "project-a"),
    ];
    const projects = [
      {
        id: "project-a",
        commands: [{ id: "command-project-a-command", name: "Dev", command: "dev" }],
      },
      { id: "project-b" },
    ] as ProjectTreeProject[];

    expect(terminalShortcutOrder(tabs, projects)).toEqual([
      "project-a-1",
      "project-a-2",
      "project-a-command",
      "project-b-1",
    ]);
  });

  it("includes only shell terminals from the current project", () => {
    const tabs = [
      terminal("project-a-shell", "project-a"),
      terminal("project-a-command", "project-a", "command"),
      terminal("project-b-shell", "project-b"),
    ];

    expect(projectTerminalIds(tabs, "project-a")).toEqual(["project-a-shell"]);
    expect(projectTerminalIds(tabs, "project-b")).toEqual(["project-b-shell"]);
  });

  it("cycles in both directions and wraps", () => {
    const ids = ["one", "two", "three"];

    expect(adjacentTabId(ids, "one", 1)).toBe("two");
    expect(adjacentTabId(ids, "one", -1)).toBe("three");
    expect(adjacentTabId(["one"], "one", 1)).toBeUndefined();
  });
});

describe("nextProjectTerminalId", () => {
  it("prefers the next terminal in the same project", () => {
    const tabs = [
      terminal("project-a-1", "project-a"),
      terminal("project-b-1", "project-b"),
      terminal("project-a-2", "project-a"),
    ];

    expect(nextProjectTerminalId(tabs, "project-a-1")).toBe("project-a-2");
  });

  it("falls back to the previous terminal in the same project", () => {
    const tabs = [terminal("project-a-1", "project-a"), terminal("project-a-2", "project-a")];

    expect(nextProjectTerminalId(tabs, "project-a-2")).toBe("project-a-1");
  });

  it("ignores terminals from other projects and command runs", () => {
    const tabs = [
      terminal("project-a-1", "project-a"),
      terminal("project-b-1", "project-b"),
      terminal("project-a-command", "project-a", "command"),
    ];

    expect(nextProjectTerminalId(tabs, "project-a-1")).toBeUndefined();
  });
});
