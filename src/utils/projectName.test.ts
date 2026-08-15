import { describe, expect, it } from "vitest";
import { projectNameFromDirectory } from "./projectName";

describe("projectNameFromDirectory", () => {
  it("derives the name from the last path segment", () => {
    expect(projectNameFromDirectory("/Users/ronald/Development/my-app")).toBe("my-app");
  });

  it("ignores trailing separators", () => {
    expect(projectNameFromDirectory("/Users/ronald/Development/my-app/")).toBe("my-app");
  });

  it("falls back for the filesystem root", () => {
    expect(projectNameFromDirectory("/")).toBe("New project");
  });

  it("falls back for an empty path", () => {
    expect(projectNameFromDirectory("")).toBe("New project");
  });

  it("falls back when the last segment is whitespace only", () => {
    expect(projectNameFromDirectory("/Users/ronald/   ")).toBe("New project");
  });

  it("supports backslash separators", () => {
    expect(projectNameFromDirectory("C:\\Projects\\my-app")).toBe("my-app");
  });
});
