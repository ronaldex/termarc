import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { sidebarTerminalIds, terminalFamilyForTab, terminalParentId } from "./terminalFamily";

function tab(id: string, overrides: Partial<TerminalTabState> = {}): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "ready",
    projectId: "project",
    cwd: "/project",
    launch: { kind: "shell" },
    status: "running",
    ...overrides,
  };
}

describe("terminal families", () => {
  it("keeps mixed direct children in tab order and excludes grandchildren", () => {
    const root = tab("root");
    const shell = tab("shell", { parentTerminalId: root.id });
    const agent = tab("agent", {
      launch: {
        kind: "subagent",
        subagentId: "agent",
        parentTerminalId: root.id,
        name: "Agent",
        commandLine: "pi",
        processKind: "pi",
      },
    });
    const grandchild = tab("grandchild", { parentTerminalId: shell.id });

    const tabs = [root, shell, agent, grandchild];
    const family = terminalFamilyForTab(tabs, agent.id);
    expect(family).toEqual({ rootTabId: root.id, memberTabIds: [root.id, shell.id, agent.id] });
    expect(sidebarTerminalIds(family, agent.id)).toEqual([root.id, shell.id]);
    expect(terminalFamilyForTab(tabs, grandchild.id)).toEqual({
      rootTabId: grandchild.id,
      memberTabIds: [grandchild.id],
    });
  });

  it("treats detached and orphaned children as independent families", () => {
    const detached = tab("detached", {
      launch: {
        kind: "subagent",
        subagentId: "agent",
        name: "Detached",
        commandLine: "pi",
        processKind: "pi",
      },
    });
    const orphan = tab("orphan", { parentTerminalId: "missing" });

    expect(terminalParentId(detached)).toBeUndefined();
    expect(terminalFamilyForTab([detached, orphan], detached.id)?.memberTabIds).toEqual([
      detached.id,
    ]);
    expect(terminalFamilyForTab([detached, orphan], orphan.id)).toEqual({
      rootTabId: orphan.id,
      memberTabIds: [orphan.id],
    });
  });
});
