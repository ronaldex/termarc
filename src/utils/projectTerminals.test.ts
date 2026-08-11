import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import {
  normalizeProjectTerminals,
  projectTerminalsEqual,
  projectTerminalsFromTabs,
} from "./projectTerminals";

function terminal(
  projectId: string,
  customTitle?: string,
  kind: "shell" | "command" = "shell",
): TerminalTabState {
  return {
    id: `${projectId}-${customTitle ?? kind}`,
    projectId,
    customTitle,
    launch:
      kind === "shell"
        ? { kind: "shell" }
        : {
            kind: "command",
            commandId: "command-1",
            commandLine: "npm run dev",
            mode: "persistent",
          },
  } as TerminalTabState;
}

describe("project terminal persistence", () => {
  it("keeps shell count and custom names in tab order", () => {
    const tabs = [
      terminal("project-a", " Editor "),
      terminal("project-b", "Other"),
      terminal("project-a"),
      terminal("project-a", "Ignored command", "command"),
    ];

    expect(projectTerminalsFromTabs(tabs, "project-a")).toEqual([
      { id: "project-a- Editor ", customTitle: "Editor" },
      { id: "project-a-shell" },
    ]);
  });

  it("preserves missing terminal lists for legacy migration and explicit empty lists", () => {
    expect(normalizeProjectTerminals(undefined)).toBeUndefined();
    expect(normalizeProjectTerminals([])).toEqual([]);
  });

  it("normalizes blank custom names", () => {
    let id = 0;
    expect(
      normalizeProjectTerminals(
        [{ customTitle: "   " }, { customTitle: " Logs " }],
        () => `id-${++id}`,
      ),
    ).toEqual([{ id: "id-1" }, { id: "id-2", customTitle: "Logs" }]);
  });

  it("distinguishes legacy missing state from an explicit matching list", () => {
    expect(projectTerminalsEqual(undefined, [])).toBe(false);
    expect(projectTerminalsEqual([], [])).toBe(true);
    expect(
      projectTerminalsEqual([{ id: "a", customTitle: "One" }], [{ id: "a", customTitle: "Two" }]),
    ).toBe(false);
  });
});
