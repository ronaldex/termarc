import { describe, expect, it } from "vitest";
import { expandHomePath } from "./homePath";

const HOME = "/Users/ronald";

describe("expandHomePath", () => {
  it("expands ~ to the home directory", () => {
    expect(expandHomePath("~", HOME)).toBe(HOME);
  });

  it("expands ~/ paths against the home directory", () => {
    expect(expandHomePath("~/development", HOME)).toBe("/Users/ronald/development");
  });

  it("expands a bare ~ trailing separator", () => {
    expect(expandHomePath("~/", HOME)).toBe(HOME);
  });

  it("ignores a trailing slash on the home directory", () => {
    expect(expandHomePath("~", `${HOME}/`)).toBe(HOME);
  });

  it("passes absolute paths through unchanged", () => {
    expect(expandHomePath("/opt/projects", HOME)).toBe("/opt/projects");
  });

  it("passes relative paths through unchanged", () => {
    expect(expandHomePath("projects", HOME)).toBe("projects");
  });

  it("does not expand ~ in the middle of a path", () => {
    expect(expandHomePath("/Users/~user", HOME)).toBe("/Users/~user");
  });
});
