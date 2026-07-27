import { describe, expect, it } from "vitest";
import { projectInitials } from "./projectInitials";

describe("projectInitials", () => {
  it("creates compact project initials", () => {
    expect(projectInitials("Term Deck")).toBe("TD");
    expect(projectInitials("single")).toBe("S");
    expect(projectInitials(" ")).toBe("•");
  });
});
