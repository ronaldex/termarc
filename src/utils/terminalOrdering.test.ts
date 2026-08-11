import { describe, expect, it } from "vitest";
import { normalizeTerminalOrdering, reorderProjectTerminalTabs } from "./terminalOrdering";

describe("terminalOrdering", () => {
  it("migrates missing and duplicate persisted IDs without changing order", () => {
    let suffix = 0;
    const result = normalizeTerminalOrdering(
      [{ id: "kept" }, {}, { id: "kept", customTitle: "Logs" }],
      () => `new-${++suffix}`,
    );
    expect(result.migrated).toBe(true);
    expect(result.terminals).toEqual([
      { id: "kept" },
      { id: "new-1" },
      { id: "new-2", customTitle: "Logs" },
    ]);
  });

  it("repairs IDs already used by another project", () => {
    const used = new Set(["terminal-a"]);
    const result = normalizeTerminalOrdering(
      [{ id: "terminal-a" }, { id: "terminal-b" }],
      () => "terminal-repaired",
      used,
    );

    expect(result.terminals).toEqual([{ id: "terminal-repaired" }, { id: "terminal-b" }]);
    expect(used).toEqual(new Set(["terminal-a", "terminal-repaired", "terminal-b"]));
  });

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
