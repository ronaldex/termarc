import { describe, expect, it } from "vitest";
import { workspaceShortcutAction, type WorkspaceShortcutInput } from "./workspaceShortcut";

function shortcut(overrides: Partial<WorkspaceShortcutInput>): WorkspaceShortcutInput {
  return {
    key: "",
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    editableTarget: false,
    focusRegion: "other",
    terminalSelected: false,
    gitSidebarAvailable: true,
    ...overrides,
  };
}

describe("workspaceShortcutAction", () => {
  it("moves focus across the three workspace regions", () => {
    expect(
      workspaceShortcutAction(
        shortcut({ key: "ArrowLeft", metaKey: true, focusRegion: "workspace" }),
      ),
    ).toEqual({ type: "focus-left-sidebar" });
    expect(
      workspaceShortcutAction(
        shortcut({ key: "ArrowRight", metaKey: true, focusRegion: "left-sidebar" }),
      ),
    ).toEqual({ type: "focus-workspace-from-left" });
    expect(
      workspaceShortcutAction(
        shortcut({ key: "ArrowRight", metaKey: true, focusRegion: "workspace" }),
      ),
    ).toEqual({ type: "focus-right-sidebar" });
    expect(
      workspaceShortcutAction(
        shortcut({ key: "ArrowLeft", metaKey: true, focusRegion: "right-sidebar" }),
      ),
    ).toEqual({ type: "focus-workspace-from-right" });
  });

  it("cycles a selected terminal from the left sidebar", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowDown",
          metaKey: true,
          focusRegion: "left-sidebar",
          terminalSelected: true,
        }),
      ),
    ).toEqual({ type: "cycle-terminal", direction: 1 });
  });

  it("does not navigate command arrows from editable content", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowRight",
          metaKey: true,
          editableTarget: true,
          focusRegion: "workspace",
        }),
      ),
    ).toBeUndefined();
  });

  it("requires the Git sidebar to be available", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowRight",
          metaKey: true,
          focusRegion: "workspace",
          gitSidebarAvailable: false,
        }),
      ),
    ).toBeUndefined();
    expect(
      workspaceShortcutAction(shortcut({ key: "d", metaKey: true, gitSidebarAvailable: false })),
    ).toBeUndefined();
  });

  it("returns global workspace actions", () => {
    expect(workspaceShortcutAction(shortcut({ key: "Escape" }))).toEqual({ type: "escape" });
    expect(workspaceShortcutAction(shortcut({ key: ",", metaKey: true }))).toEqual({
      type: "open-settings",
    });
    expect(workspaceShortcutAction(shortcut({ key: "D", metaKey: true }))).toEqual({
      type: "toggle-right-sidebar",
    });
  });
});
