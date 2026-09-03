import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { terminalClosePlan } from "./parentClose";

function tab(
  id: string,
  options: { parentTerminalId?: string; processName?: string } = {},
): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId: "project-1",
    cwd: ".",
    launch: { kind: "shell" },
    status: "running",
    ...options,
  };
}

describe("terminal close plan", () => {
  it("closes every subterminal when closing a family root", () => {
    const tabs = [
      tab("root", { processName: "vim" }),
      tab("shell-child", { parentTerminalId: "root" }),
      tab("busy-child", { parentTerminalId: "root", processName: "npm" }),
      tab("other"),
    ];

    expect(terminalClosePlan(tabs, "root")).toEqual({
      tabIds: ["root", "shell-child", "busy-child"],
      childCount: 2,
      runningProcessCount: 2,
    });
  });

  it("only closes the selected subterminal", () => {
    const tabs = [tab("root"), tab("child", { parentTerminalId: "root", processName: "top" })];

    expect(terminalClosePlan(tabs, "child")).toEqual({
      tabIds: ["child"],
      childCount: 0,
      runningProcessCount: 1,
    });
  });
});
