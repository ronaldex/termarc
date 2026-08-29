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
  it("creates terminals and subterminals with command shortcuts", () => {
    expect(workspaceShortcutAction(shortcut({ key: "t", metaKey: true }))).toEqual({
      type: "create-terminal",
    });
    expect(
      workspaceShortcutAction(shortcut({ key: "T", code: "KeyT", metaKey: true, shiftKey: true })),
    ).toEqual({ type: "create-subterminal" });
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
        shortcut({
          key: "ArrowRight",
          metaKey: true,
          focusRegion: "right-sidebar",
          rightSidebarHasNextMode: true,
        }),
      ),
    ).toEqual({ type: "focus-next-right-sidebar" });
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowLeft",
          metaKey: true,
          focusRegion: "right-sidebar",
          rightSidebarHasPreviousMode: true,
        }),
      ),
    ).toEqual({ type: "focus-previous-right-sidebar" });
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
    ).toEqual({ type: "cycle-terminal", direction: 1, includeChildren: false });
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
    ).toEqual({ type: "cycle-terminal", direction: -1, includeChildren: false });
  });

  it("cycles focused subterminals vertically", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowDown",
          metaKey: true,
          focusRegion: "right-sidebar",
          subterminalFocused: true,
        }),
      ),
    ).toEqual({ type: "cycle-subterminal", direction: 1, includeMain: false });
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowUp",
          metaKey: true,
          focusRegion: "right-sidebar",
          subterminalFocused: true,
        }),
      ),
    ).toEqual({ type: "cycle-subterminal", direction: -1, includeMain: false });
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowDown",
          metaKey: true,
          shiftKey: true,
          focusRegion: "right-sidebar",
          subterminalFocused: true,
        }),
      ),
    ).toEqual({ type: "cycle-subterminal", direction: 1, includeMain: true });
  });

  it("includes subagents and subterminals when Shift is held", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowDown",
          metaKey: true,
          shiftKey: true,
          focusRegion: "workspace",
          terminalSelected: true,
        }),
      ),
    ).toEqual({ type: "cycle-terminal", direction: 1, includeChildren: true });
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

  it("opens the generic sidebar when subterminals are available without Git", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowRight",
          metaKey: true,
          focusRegion: "workspace",
          gitSidebarAvailable: false,
          rightSidebarAvailable: true,
        }),
      ),
    ).toEqual({ type: "focus-right-sidebar" });
  });

  it("requires an available right-sidebar mode", () => {
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "ArrowRight",
          metaKey: true,
          focusRegion: "workspace",
          gitSidebarAvailable: false,
          rightSidebarAvailable: false,
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
    expect(workspaceShortcutAction(shortcut({ key: "s", code: "KeyS", metaKey: true }))).toEqual({
      type: "toggle-left-sidebar",
    });
    expect(
      workspaceShortcutAction(shortcut({ key: "S", code: "KeyS", metaKey: true, shiftKey: true })),
    ).toBeUndefined();
    expect(
      workspaceShortcutAction(
        shortcut({
          key: "D",
          code: "KeyD",
          metaKey: true,
          gitSidebarAvailable: false,
          rightSidebarAvailable: true,
        }),
      ),
    ).toEqual({ type: "toggle-right-sidebar" });
  });
});
