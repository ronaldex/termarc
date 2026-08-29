import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { normalizedTerminalParentId } from "./terminalHierarchy";

function tab(id: string, overrides: Partial<TerminalTabState> = {}): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "running",
    projectId: "project",
    cwd: "/project",
    launch: { kind: "shell" },
    status: "running",
    ...overrides,
  };
}

describe("terminal hierarchy normalization", () => {
  it("accepts only same-project direct children of non-subagent roots", () => {
    const root = tab("root");
    const child = tab("child", { parentTerminalId: root.id });
    const grandchild = tab("grandchild", { parentTerminalId: child.id });
    const crossProject = tab("cross", { projectId: "other", parentTerminalId: root.id });
    const subagent = tab("agent", {
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: root.id,
        name: "Agent",
        commandLine: "pi",
        processKind: "pi",
      },
    });
    const invalidChild = tab("invalid-child", { parentTerminalId: subagent.id });
    const tabs = [root, child, grandchild, crossProject, subagent, invalidChild];

    expect(normalizedTerminalParentId(tabs, child)).toBe(root.id);
    expect(normalizedTerminalParentId(tabs, subagent)).toBe(root.id);
    expect(normalizedTerminalParentId(tabs, grandchild)).toBeUndefined();
    expect(normalizedTerminalParentId(tabs, crossProject)).toBeUndefined();
    expect(normalizedTerminalParentId(tabs, invalidChild)).toBeUndefined();
  });
});
