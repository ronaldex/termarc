import { describe, expect, it } from "vitest";
import {
  parseTerminalAgentMarker,
  parseTerminalShellMarker,
  subagentPiStateUpdate,
} from "./terminalAgentStatus";

describe("parseTerminalAgentMarker", () => {
  it("parses Termarc Pi processing, waiting, and stopped markers", () => {
    expect(parseTerminalAgentMarker("termarc;pi;processing")).toEqual({
      agent: "pi",
      state: "processing",
    });
    expect(parseTerminalAgentMarker("termarc;pi;waiting")).toEqual({
      agent: "pi",
      state: "waiting",
    });
    expect(parseTerminalAgentMarker("termarc;pi;stopped")).toEqual({
      agent: "pi",
      state: "stopped",
    });
  });

  it("rejects malformed and unknown-owner markers", () => {
    expect(parseTerminalAgentMarker("termarc;pi;unknown")).toBeUndefined();
    expect(parseTerminalAgentMarker("other;pi;processing")).toBeUndefined();
    expect(parseTerminalAgentMarker("termarc;pi;waiting;extra")).toBeUndefined();
  });
});

describe("subagentPiStateUpdate", () => {
  it("associates a parsed Pi marker with a subagent terminal", () => {
    const marker = parseTerminalAgentMarker("termarc;pi;waiting");
    expect(marker).toBeDefined();
    expect(
      subagentPiStateUpdate(
        "terminal-child",
        {
          kind: "subagent",
          subagentId: "subagent-1",
          parentTerminalId: "terminal-parent",
          name: "Research",
          commandLine: "pi",
          processKind: "pi",
        },
        marker!,
      ),
    ).toEqual({
      subagentId: "subagent-1",
      terminalId: "terminal-child",
      piState: "waiting",
    });
  });

  it("does not forward Pi markers for generic terminals", () => {
    expect(
      subagentPiStateUpdate("terminal-1", { kind: "shell" }, { agent: "pi", state: "waiting" }),
    ).toBeUndefined();
  });
});

describe("parseTerminalShellMarker", () => {
  it("parses Termarc command exit statuses", () => {
    expect(parseTerminalShellMarker("termarc;shell;2")).toEqual({ exitCode: 2 });
  });

  it("rejects malformed statuses", () => {
    expect(parseTerminalShellMarker("termarc;shell;-1")).toBeUndefined();
    expect(parseTerminalShellMarker("termarc;shell;1;extra")).toBeUndefined();
  });
});
