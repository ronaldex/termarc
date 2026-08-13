import { describe, expect, it } from "vitest";
import { isTerminalLinkModifierPressed } from "./terminalLinks";

describe("isTerminalLinkModifierPressed", () => {
  it("uses Command when configured", () => {
    expect(isTerminalLinkModifierPressed({ ctrlKey: false, metaKey: true }, "meta")).toBe(true);
    expect(isTerminalLinkModifierPressed({ ctrlKey: true, metaKey: false }, "meta")).toBe(false);
  });

  it("uses Control when configured", () => {
    expect(isTerminalLinkModifierPressed({ ctrlKey: true, metaKey: false }, "ctrl")).toBe(true);
    expect(isTerminalLinkModifierPressed({ ctrlKey: false, metaKey: true }, "ctrl")).toBe(false);
  });
});
