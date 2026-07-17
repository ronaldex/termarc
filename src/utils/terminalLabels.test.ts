import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { terminalDisplayModel, terminalMatchesFilter } from "./terminalLabels";

function tab(overrides: Partial<TerminalTabState> = {}): TerminalTabState {
  return {
    id: "terminal-1",
    number: 1,
    title: "Terminal 1",
    detail: "running",
    projectId: "project-1",
    cwd: "/workspace",
    launch: { kind: "shell" },
    status: "running",
    ...overrides,
  };
}

describe("terminalDisplayModel", () => {
  it("prioritizes a custom name and exposes process activity as the secondary label", () => {
    expect(
      terminalDisplayModel(
        tab({ name: "Frontend", terminalTitle: "vite", processName: "node", currentCwd: "/app" }),
      ),
    ).toEqual({
      primaryLabel: "Frontend",
      secondaryLabel: "node",
      tooltip: "node",
      busy: false,
      running: true,
      primaryIsPath: false,
      secondaryIsPath: false,
    });
  });

  it("uses the terminal-provided title before process activity", () => {
    expect(
      terminalDisplayModel(tab({ terminalTitle: "pi - term-deck", processName: "pi" })),
    ).toMatchObject({
      primaryLabel: "pi - term-deck",
      secondaryLabel: "pi",
      tooltip: "pi",
    });
  });

  it("uses the recognized agent label and only marks processing agents busy", () => {
    expect(
      terminalDisplayModel(
        tab({ agent: "pi", agentState: "waiting", processName: "node", currentCwd: "/app" }),
      ),
    ).toMatchObject({ primaryLabel: "Pi", tooltip: "Pi", busy: false });
    expect(terminalDisplayModel(tab({ agent: "pi", agentState: "processing" }))).toMatchObject({
      busy: true,
      running: false,
    });
  });

  it("falls back to the current cwd and marks the primary label as a path", () => {
    expect(terminalDisplayModel(tab({ currentCwd: "/workspace/packages/app" }))).toEqual({
      primaryLabel: "/workspace/packages/app",
      secondaryLabel: undefined,
      tooltip: "/workspace/packages/app",
      busy: false,
      running: false,
      primaryIsPath: true,
      secondaryIsPath: true,
    });
  });

  it("falls back to the configured cwd when no runtime activity is available", () => {
    expect(terminalDisplayModel(tab({ cwd: "/fallback" })).primaryLabel).toBe("/fallback");
  });

  it("shows cwd as a path-like secondary label for a named idle terminal", () => {
    expect(terminalDisplayModel(tab({ name: "Shell", currentCwd: "/repo" }))).toMatchObject({
      secondaryLabel: "/repo",
      secondaryIsPath: true,
    });
  });
});

describe("terminalMatchesFilter", () => {
  const subject = tab({
    name: "Frontend",
    terminalTitle: "Vite Dev Server",
    processName: "node",
    currentCwd: "/workspace/packages/web",
    cwd: "/workspace",
  });

  it.each(["front", "DEV SERVER", "node", "packages/web", "terminal 1"])(
    "matches %s against terminal display and fallback fields",
    (query) => expect(terminalMatchesFilter(subject, query)).toBe(true),
  );

  it("trims queries and accepts an empty filter", () => {
    expect(terminalMatchesFilter(subject, "  vite ")).toBe(true);
    expect(terminalMatchesFilter(subject, "   ")).toBe(true);
  });

  it("rejects unmatched queries", () => {
    expect(terminalMatchesFilter(subject, "backend")).toBe(false);
  });
});
