import { describe, expect, it } from "vitest";
import { parseTerminalAgentMarker, parseTerminalShellMarker } from "./terminalAgentStatus";

describe("parseTerminalAgentMarker", () => {
  it("parses Termarc Pi processing and waiting markers", () => {
    expect(parseTerminalAgentMarker("termarc;pi;processing")).toEqual({
      agent: "pi",
      state: "processing",
    });
    expect(parseTerminalAgentMarker("termarc;pi;waiting")).toEqual({
      agent: "pi",
      state: "waiting",
    });
  });

  it("rejects malformed and unknown-owner markers", () => {
    expect(parseTerminalAgentMarker("termarc;pi;unknown")).toBeUndefined();
    expect(parseTerminalAgentMarker("other;pi;processing")).toBeUndefined();
    expect(parseTerminalAgentMarker("termarc;pi;waiting;extra")).toBeUndefined();
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
