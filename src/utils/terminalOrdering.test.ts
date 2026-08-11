import { describe, expect, it } from "vitest";
import { reorderProjectTerminalTabs } from "./terminalOrdering";

describe("terminalOrdering", () => {
  it("reorders only shell terminals in the selected project", () => {
    const shell = (id: string, projectId = "a") => ({
      id,
      projectId,
      launch: { kind: "shell" as const },
    });
    const tabs = [
      shell("one"),
      {
        id: "run",
        projectId: "a",
        launch: {
          kind: "command" as const,
          commandId: "x",
          commandLine: "x",
          mode: "single-shot" as const,
        },
      },
      shell("other", "b"),
      shell("two"),
    ];
    expect(
      reorderProjectTerminalTabs(tabs, "a", "two", "one", "before").map((tab) => tab.id),
    ).toEqual(["two", "run", "other", "one"]);
  });
});
