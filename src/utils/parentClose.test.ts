import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { activeDirectSubagentTabs, parentClosePlan } from "./parentClose";

function tab(id: string, status: TerminalTabState["status"] = "running"): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId: "project-1",
    cwd: ".",
    launch: { kind: "shell" },
    status,
  };
}

function child(id: string, parentTerminalId: string, status: TerminalTabState["status"]) {
  return {
    ...tab(id, status),
    launch: {
      kind: "subagent" as const,
      subagentId: `subagent-${id}`,
      parentTerminalId,
      name: id,
      commandLine: "pi",
      processKind: "pi",
    },
  };
}

describe("parent close decisions", () => {
  it("only prompts for active direct children", () => {
    const tabs = [
      tab("parent"),
      child("running", "parent", "running"),
      child("complete", "parent", "stopped"),
      child("other", "other-parent", "running"),
    ];

    expect(activeDirectSubagentTabs(tabs, "parent").map(({ id }) => id)).toEqual(["running"]);
    expect(parentClosePlan(tabs, "parent")).toEqual({
      action: "cancel",
      childTabIds: ["running", "complete"],
    });
    expect(parentClosePlan(tabs, "parent", "stop").action).toBe("close");
    expect(parentClosePlan(tabs, "parent", "detach").action).toBe("detach");
  });

  it("closes directly without children and detaches completed children without prompting", () => {
    expect(parentClosePlan([tab("parent")], "parent")).toEqual({
      action: "close",
      childTabIds: [],
    });
    expect(parentClosePlan([tab("parent"), child("done", "parent", "error")], "parent")).toEqual({
      action: "detach",
      childTabIds: ["done"],
    });
  });
});
