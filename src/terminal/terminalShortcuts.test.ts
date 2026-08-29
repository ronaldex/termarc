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
    fontSize: 13,
    selectTab: vi.fn(),
    setFontSize: vi.fn(),
  };
}

describe("handleTerminalShortcut", () => {
  it("leaves terminal navigation to the workspace handler", () => {
    const deps = dependencies();

    expect(handleTerminalShortcut(keyboardEvent({ key: "ArrowDown", metaKey: true }), deps)).toBe(
      false,
    );
    expect(
      handleTerminalShortcut(
        keyboardEvent({ key: "ArrowDown", metaKey: true, shiftKey: true }),
        deps,
      ),
    ).toBe(false);
    expect(deps.selectTab).not.toHaveBeenCalled();
  });

  it("leaves global terminal lifecycle shortcuts to the workspace handler", () => {
    const deps = dependencies();

    expect(handleTerminalShortcut(keyboardEvent({ key: "t", metaKey: true }), deps)).toBe(false);
    expect(handleTerminalShortcut(keyboardEvent({ key: "w", metaKey: true }), deps)).toBe(false);
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
