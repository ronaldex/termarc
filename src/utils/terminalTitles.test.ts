import { describe, expect, it } from "vitest";
import { normalizeTerminalTitle, updateTerminalTitleOverride } from "./terminalTitles";

describe("normalizeTerminalTitle", () => {
  it("trims a title and clears blank overrides", () => {
    expect(normalizeTerminalTitle("  Frontend  ")).toBe("Frontend");
    expect(normalizeTerminalTitle(" \t ")).toBeUndefined();
  });

  it("resets only the custom title layer", () => {
    const tab = {
      customTitle: "Frontend",
      launchTitle: "Development",
      terminalTitle: "vite",
    };

    updateTerminalTitleOverride(tab, " ");

    expect(tab).toEqual({
      customTitle: undefined,
      launchTitle: "Development",
      terminalTitle: "vite",
    });
  });
});
