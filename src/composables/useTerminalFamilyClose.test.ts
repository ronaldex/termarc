import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { TerminalTab } from "../types/terminal";
import { useTerminalFamilyClose } from "./useTerminalFamilyClose";

function tab(
  id: string,
  options: { parentTerminalId?: string; processName?: string } = {},
): TerminalTab {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId: "project",
    cwd: "/project",
    launch: { kind: "shell" },
    status: "running",
    ...options,
  } as TerminalTab;
}

function workflowFor(tabs: TerminalTab[], choice: "close" | "cancel" = "close") {
  const ask = vi.fn().mockResolvedValue(choice);
  const closeChild = vi.fn(async (id: string) => {
    tabs.splice(
      tabs.findIndex((candidate) => candidate.id === id),
      1,
    );
  });
  const closeTerminal = vi.fn(async (id: string) => {
    tabs.splice(
      tabs.findIndex((candidate) => candidate.id === id),
      1,
    );
  });
  const selectAfterClose = vi.fn();
  const workflow = useTerminalFamilyClose({
    tabs,
    activeTabId: ref("root"),
    mainTerminalId: ref("root"),
    ask,
    closeChild,
    closeTerminal,
    selectTab: vi.fn(),
    selectAfterClose,
    markPersistenceEligible: vi.fn(),
  });
  return { ask, closeChild, closeTerminal, selectAfterClose, workflow };
}

describe("useTerminalFamilyClose", () => {
  it("closes all subterminals with a main terminal after confirmation", async () => {
    const tabs = [
      tab("root"),
      tab("shell-child", { parentTerminalId: "root" }),
      tab("busy-child", { parentTerminalId: "root", processName: "npm" }),
    ];
    const { ask, closeChild, closeTerminal, selectAfterClose, workflow } = workflowFor(tabs);

    await workflow.close("root");

    expect(ask).toHaveBeenCalledWith({
      tabIds: ["root", "shell-child", "busy-child"],
      childCount: 2,
      runningProcessCount: 1,
    });
    expect(closeChild).toHaveBeenCalledTimes(2);
    expect(closeTerminal).toHaveBeenCalledWith("root");
    expect(selectAfterClose).toHaveBeenCalledWith("root", []);
    expect(tabs).toEqual([]);
    expect(workflow.suppressPresentation.value).toBe(false);
  });

  it("does not close a terminal when running-process confirmation is cancelled", async () => {
    const tabs = [tab("root", { processName: "vim" })];
    const { closeTerminal, workflow } = workflowFor(tabs, "cancel");

    await workflow.close("root");

    expect(closeTerminal).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(1);
  });

  it("closes idle terminals without prompting", async () => {
    const tabs = [tab("root")];
    const { ask, closeTerminal, workflow } = workflowFor(tabs);

    await workflow.close("root");

    expect(ask).not.toHaveBeenCalled();
    expect(closeTerminal).toHaveBeenCalledWith("root");
  });
});
