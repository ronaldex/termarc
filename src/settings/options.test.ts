import { describe, expect, it } from "vitest";
import { resolveExternalEditor } from "./options";

describe("resolveExternalEditor", () => {
  it("uses the project override when configured", () => {
    expect(resolveExternalEditor("phpstorm", "vscodium")).toBe("phpstorm");
  });

  it("falls back to the app editor", () => {
    expect(resolveExternalEditor(undefined, "vscode")).toBe("vscode");
  });
});
