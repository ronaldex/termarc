import { describe, expect, it, vi } from "vitest";
import { handleTerminalShortcut } from "./terminalShortcuts";

function keyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

function dependencies() {
  return {
    terminalFocused: true,
    tabIdsByNumber: new Map([
      [1, "one"],
      [2, "two"],
    ]),
    orderedTabIds: ["one", "two"],
    activeTabId: "one",
    fontSize: 13,
    selectTab: vi.fn(),
    setFontSize: vi.fn(),
    createTab: vi.fn(),
    closeActiveTab: vi.fn(),
  };
}

describe("handleTerminalShortcut", () => {
  it("cycles terminal tabs while the terminal is focused", () => {
    const deps = dependencies();

    expect(
      handleTerminalShortcut(
        keyboardEvent({ key: "ArrowDown", metaKey: true, shiftKey: true }),
        deps,
      ),
    ).toBe(true);
    expect(deps.selectTab).toHaveBeenCalledWith("two");
  });

  it("steps through supported font sizes", () => {
    const deps = dependencies();

    expect(handleTerminalShortcut(keyboardEvent({ key: "=", metaKey: true }), deps)).toBe(true);
    expect(deps.setFontSize).toHaveBeenCalledWith(14);
  });

  it("leaves unrelated keyboard input alone", () => {
    const deps = dependencies();

    expect(handleTerminalShortcut(keyboardEvent({ key: "x" }), deps)).toBe(false);
    expect(deps.selectTab).not.toHaveBeenCalled();
  });
});
