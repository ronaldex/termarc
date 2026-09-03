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
        },
      },
      shell("other", "b"),
      shell("two"),
    ];
    expect(
      reorderProjectTerminalTabs(tabs, "a", "two", "one", "before").map((tab) => tab.id),
    ).toEqual(["two", "run", "other", "one"]);
  });

  it("moves a root with its direct children and promotes deep links", () => {
    const shell = (id: string, parentTerminalId?: string) => ({
      id,
      projectId: "a",
      launch: { kind: "shell" as const },
      parentTerminalId,
    });
    const tabs = [
      shell("root-a"),
      shell("root-b"),
      shell("child-a", "root-a"),
      shell("grandchild", "child-a"),
    ];

    expect(
      reorderProjectTerminalTabs(tabs, "a", "root-a", "root-b", "after").map((tab) => tab.id),
    ).toEqual(["root-b", "root-a", "child-a", "grandchild"]);
  });

  it("reorders children within their parent", () => {
    const shell = (id: string, parentTerminalId?: string) => ({
      id,
      projectId: "a",
      launch: { kind: "shell" as const },
      parentTerminalId,
    });
    const tabs = [shell("root"), shell("one", "root"), shell("two", "root")];

    const reordered = reorderProjectTerminalTabs(tabs, "a", "two", "one", "before");
    expect(reordered.map((tab) => tab.id)).toEqual(["root", "two", "one"]);
    expect(reordered.find((tab) => tab.id === "two")?.parentTerminalId).toBe("root");
  });

  it("promotes a child when it is dropped beside a root", () => {
    const shell = (id: string, parentTerminalId?: string) => ({
      id,
      projectId: "a",
      launch: { kind: "shell" as const },
      parentTerminalId,
    });
    const tabs = [shell("root-a"), shell("child", "root-a"), shell("root-b")];

    const reordered = reorderProjectTerminalTabs(tabs, "a", "child", "root-b", "after");
    expect(reordered.map((tab) => tab.id)).toEqual(["root-a", "root-b", "child"]);
    expect(reordered.find((tab) => tab.id === "child")?.parentTerminalId).toBeUndefined();
  });

  it("keeps stale, cyclic, and deep shell links as independently orderable roots", () => {
    const shell = (id: string, parentTerminalId?: string) => ({
      id,
      projectId: "a",
      launch: { kind: "shell" as const },
      parentTerminalId,
    });
    const tabs = [
      shell("root"),
      shell("child", "root"),
      shell("deep", "child"),
      shell("stale", "gone"),
      shell("cycle-a", "cycle-b"),
      shell("cycle-b", "cycle-a"),
    ];

    expect(
      reorderProjectTerminalTabs(tabs, "a", "root", "stale", "after").map((tab) => tab.id),
    ).toEqual(["deep", "stale", "root", "child", "cycle-a", "cycle-b"]);
  });
});
