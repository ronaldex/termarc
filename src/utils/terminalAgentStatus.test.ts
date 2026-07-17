import { describe, expect, it } from "vitest";
import { parseTerminalAgentMarker, parseTerminalShellMarker } from "./terminalAgentStatus";

describe("parseTerminalAgentMarker", () => {
  it("parses Pi processing and waiting markers", () => {
    expect(parseTerminalAgentMarker("termdeck;pi;processing")).toEqual({
      agent: "pi",
      state: "processing",
    });
    expect(parseTerminalAgentMarker("termdeck;pi;waiting")).toEqual({
      agent: "pi",
      state: "waiting",
    });
  });

  it("parses the stopped marker without an active state", () => {
    expect(parseTerminalAgentMarker("termdeck;pi;stopped")).toEqual({ agent: "pi" });
  });

  it("rejects malformed and non-Termdeck markers", () => {
    expect(parseTerminalAgentMarker("termdeck;pi;unknown")).toBeUndefined();
    expect(parseTerminalAgentMarker("other;pi;processing")).toBeUndefined();
    expect(parseTerminalAgentMarker("termdeck;pi;waiting;extra")).toBeUndefined();
  });
});

describe("parseTerminalShellMarker", () => {
  it("parses command exit statuses", () => {
    expect(parseTerminalShellMarker("termdeck;shell;2")).toEqual({ exitCode: 2 });
  });

  it("rejects malformed statuses", () => {
    expect(parseTerminalShellMarker("termdeck;shell;-1")).toBeUndefined();
    expect(parseTerminalShellMarker("termdeck;shell;1;extra")).toBeUndefined();
  });
});
