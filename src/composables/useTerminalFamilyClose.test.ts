import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { TerminalTab } from "../types/terminal";
import { useTerminalFamilyClose } from "./useTerminalFamilyClose";

function tab(id: string, launch: TerminalTab["launch"] = { kind: "shell" }): TerminalTab {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId: "project",
    cwd: "/project",
    launch,
    status: "running",
  } as TerminalTab;
}

describe("useTerminalFamilyClose", () => {
  it("detaches active subagents before closing and promotes a family child", async () => {
    const root = tab("root");
    const shellChild = { ...tab("shell-child"), parentTerminalId: root.id } as TerminalTab;
    const agent = tab("agent", {
      kind: "subagent",
      subagentId: "agent-id",
      parentTerminalId: root.id,
      name: "Agent",
      commandLine: "pi",
      processKind: "pi",
    });
    const tabs = [root, shellChild, agent];
    const detach = vi.fn().mockResolvedValue(undefined);
    const selectAfterClose = vi.fn();
    const closeTerminal = vi.fn(async (id: string) => {
      tabs.splice(
        tabs.findIndex((candidate) => candidate.id === id),
        1,
      );
    });
    const workflow = useTerminalFamilyClose({
      tabs,
      activeTabId: ref("root"),
      mainTerminalId: ref("root"),
      ask: vi.fn().mockResolvedValue("detach"),
      detach,
      closeChild: vi.fn(),
      closeTerminal,
      selectTab: vi.fn(),
      selectAfterClose,
      markPersistenceEligible: vi.fn(),
      reportError: vi.fn(),
    });

    await workflow.close("root");

    expect(detach).toHaveBeenCalledWith("root", ["agent-id"]);
    expect(agent.launch.kind === "subagent" && agent.launch.parentTerminalId).toBeUndefined();
    expect(closeTerminal).toHaveBeenCalledWith("root");
    expect(selectAfterClose).toHaveBeenCalledWith("root", ["shell-child", "agent"]);
    expect(workflow.suppressPresentation.value).toBe(false);
  });

  it("leaves the family untouched when detaching fails", async () => {
    const root = tab("root");
    const agent = tab("agent", {
      kind: "subagent",
      subagentId: "agent-id",
      parentTerminalId: root.id,
      name: "Agent",
      commandLine: "pi",
      processKind: "pi",
    });
    const closeTerminal = vi.fn();
    const reportError = vi.fn();
    const workflow = useTerminalFamilyClose({
      tabs: [root, agent],
      activeTabId: ref("root"),
      mainTerminalId: ref("root"),
      ask: vi.fn().mockResolvedValue("detach"),
      detach: vi.fn().mockRejectedValue(new Error("offline")),
      closeChild: vi.fn(),
      closeTerminal,
      selectTab: vi.fn(),
      selectAfterClose: vi.fn(),
      markPersistenceEligible: vi.fn(),
      reportError,
    });

    await workflow.close("root");

    expect(closeTerminal).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith("Could not detach subagents", expect.any(Error));
  });
});
