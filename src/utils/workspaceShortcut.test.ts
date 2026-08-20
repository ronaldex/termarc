import { describe, expect, it } from "vitest";
import {
  workspaceContentFocusTarget,
  workspaceShortcutAction,
  type WorkspaceShortcutInput,
} from "./workspaceShortcut";

function shortcut(overrides: Partial<WorkspaceShortcutInput>): WorkspaceShortcutInput {
  return {
    key: "",
    code: "",
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    editableTarget: false,
    focusRegion: "other",
    terminalSelected: false,
    activeTerminalAvailable: false,
    gitSidebarAvailable: true,
    ...overrides,
  };
}

describe("workspaceContentFocusTarget", () => {
  it("focuses an active selected terminal instead of the workspace container", () => {
    expect(workspaceContentFocusTarget(true, true)).toBe("terminal");
    expect(workspaceContentFocusTarget(false, true)).toBe("workspace");
    expect(workspaceContentFocusTarget(true, false)).toBe("workspace");
  });
});

describe("workspaceShortcutAction", () => {
  it("creates and closes terminals with command shortcuts", () => {
    expect(workspaceShortcutAction(shortcut({ key: "t", metaKey: true }))).toEqual({
      type: "create-terminal",
    });
    expect(
      workspaceShortcutAction(shortcut({ key: "w", metaKey: true, activeTerminalAvailable: true })),
    ).toEqual({ type: "close-terminal" });
  });

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

  it("cycles a selected agent or terminal while the main content is focused", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowUp",
          metaKey: true,
          focusRegion: "workspace",
          terminalSelected: true,
        }),
      ),
    ).toEqual({ type: "cycle-terminal", direction: -1 });
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
    expect(
      workspaceShortcutAction(shortcut({ key: "F", code: "KeyF", metaKey: true, shiftKey: true })),
    ).toEqual({ type: "focus-process-filter" });
    expect(workspaceShortcutAction(shortcut({ key: "¡", code: "Digit1", altKey: true }))).toEqual({
      type: "focus-project",
      number: 1,
    });
    expect(workspaceShortcutAction(shortcut({ key: "p", code: "KeyP", metaKey: true }))).toEqual({
      type: "toggle-left-sidebar",
    });
    expect(
      workspaceShortcutAction(shortcut({ key: "P", code: "KeyP", metaKey: true, shiftKey: true })),
    ).toBeUndefined();
    expect(workspaceShortcutAction(shortcut({ key: "D", metaKey: true }))).toEqual({
      type: "toggle-right-sidebar",
    });
  });
});
