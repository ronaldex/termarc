import { describe, expect, it } from "vitest";
import type { ProjectCommand } from "../types/project";
import { effectiveCommandOrder, reorderCommands } from "./commandOrdering";

const command = (id: string, order?: number): ProjectCommand => ({
  id,
  name: id,
  command: id,
  mode: "single-shot",
  order,
});

describe("commandOrdering", () => {
  it("keeps legacy store order and lets local commands override global IDs", () => {
    const result = effectiveCommandOrder(
      [command("a"), command("b")],
      [command("b"), command("c")],
    );
    expect(result.ok && result.orderedIds).toEqual(["a", "b", "c"]);
    expect(result.ok && result.localCommands.map((item) => item.order)).toEqual([1, 2]);
  });

  it("ranks mixed global and local commands as one list", () => {
    const result = reorderCommands(
      [command("a"), command("c")],
      [command("b")],
      "b",
      "a",
      "before",
    );
    expect(result.ok && result.orderedIds).toEqual(["b", "a", "c"]);
    expect(result.ok && result.globalCommands.map(({ id, order }) => [id, order])).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
    expect(result.ok && result.localCommands[0]?.order).toBe(0);
  });

  it("rejects duplicate IDs and invalid ranks within a store", () => {
    expect(effectiveCommandOrder([command("a"), command("a")], []).ok).toBe(false);
    expect(effectiveCommandOrder([command("a", -1)], []).ok).toBe(false);
    expect(effectiveCommandOrder([command("a", 0), command("b", 0)], []).ok).toBe(false);
    expect(effectiveCommandOrder([command("a", 0)], [command("b", 0)]).ok).toBe(false);
  });
});
