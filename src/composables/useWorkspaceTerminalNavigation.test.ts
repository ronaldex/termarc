import { describe, expect, it } from "vitest";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalSelectionAfterRemoval } from "./useWorkspaceTerminalNavigation";

function terminal(id: string, projectId = "project-a"): TerminalTabState {
  return {
    id,
    projectId,
    number: 1,
    title: id,
    detail: "",
    cwd: ".",
    launch: { kind: "shell" },
    status: "running",
  };
}

function selected(tab: TerminalTabState): SidebarSelection {
  return { id: tab.id, kind: "terminal", projectId: tab.projectId, tabId: tab.id };
}

describe("terminalSelectionAfterRemoval", () => {
  it("does not change selection when a background terminal closes", () => {
    const active = terminal("active");
    const background = terminal("background");

    expect(terminalSelectionAfterRemoval([active, background], [active], selected(active))).toBe(
      undefined,
    );
  });

  it("selects the preferred sibling when the selected terminal closes", () => {
    const closing = terminal("closing");
    const next = terminal("next");

    expect(terminalSelectionAfterRemoval([closing, next], [next], selected(closing))).toEqual(
      selected(next),
    );
  });

  it("falls back to add terminal when the project has no shell left", () => {
    const closing = terminal("closing");

    expect(terminalSelectionAfterRemoval([closing], [], selected(closing))).toEqual({
      id: "project-a:add-terminal",
      kind: "add-terminal",
      projectId: "project-a",
    });
  });
});
