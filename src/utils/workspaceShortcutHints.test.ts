import { describe, expect, it } from "vitest";
import { workspaceShortcutHints } from "./workspaceShortcutHints";

const terminalSelection = {
  id: "tab-1",
  kind: "terminal" as const,
  projectId: "project-1",
  tabId: "tab-1",
};
const projectSelection = { id: "project-1", kind: "project" as const, projectId: "project-1" };

describe("workspaceShortcutHints", () => {
  it("shows terminal navigation only while a terminal has focus", () => {
    expect(
      workspaceShortcutHints({
        focusRegion: "workspace",
        selection: terminalSelection,
        terminalFocused: true,
        rightSidebarAvailable: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: "Cycle terminals", keys: "⌘ ↑ ↓" },
        { label: "Switch terminal", keys: "⌘ 1–9" },
      ]),
    );
  });

  it("shows navigation appropriate to the focused sidebar", () => {
    expect(
      workspaceShortcutHints({
        focusRegion: "left-sidebar",
        selection: projectSelection,
        terminalFocused: false,
        rightSidebarAvailable: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: "Open", keys: "Enter" },
        { label: "Focus workspace", keys: "⌘ →" },
      ]),
    );
  });

  it("shows terminal cycling only for a focused subterminal and applicable panel navigation", () => {
    expect(
      workspaceShortcutHints({
        focusRegion: "right-sidebar",
        selection: terminalSelection,
        terminalFocused: true,
        rightSidebarAvailable: true,
        rightSidebarMode: "subterminals",
        rightSidebarHasPreviousMode: false,
        rightSidebarHasNextMode: true,
      }),
    ).toEqual([
      { label: "Cycle terminals", keys: "⌘ ↑ ↓" },
      { label: "Include main", keys: "⌘ ⇧ ↑ ↓" },
      { label: "Focus workspace", keys: "⌘ ←" },
      { label: "Next view", keys: "⌘ →" },
      { label: "Close panel", keys: "Esc" },
    ]);
  });

  it("does not advertise an unavailable right sidebar", () => {
    expect(
      workspaceShortcutHints({
        focusRegion: "workspace",
        selection: projectSelection,
        terminalFocused: false,
        rightSidebarAvailable: false,
      }),
    ).not.toContainEqual({ label: "Focus panel", keys: "⌘ →" });
  });
});
