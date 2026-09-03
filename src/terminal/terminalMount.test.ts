import { describe, expect, it } from "vitest";
import { createTerminalMount, mountTerminalRoot, unmountTerminalRoot } from "./terminalMount";

type FakeElement = {
  parentElement?: FakeElement;
  child?: FakeElement;
  className: string;
  append: (child: FakeElement) => void;
  remove: () => void;
};

function element(): FakeElement {
  return {
    className: "",
    append(child) {
      if (child.parentElement) child.parentElement.child = undefined;
      this.child = child;
      child.parentElement = this;
    },
    remove() {
      if (this.parentElement) this.parentElement.child = undefined;
      this.parentElement = undefined;
    },
  };
}

describe("terminalMount", () => {
  it("relocates one stable root and ignores stale unmounts", () => {
    const mount = createTerminalMount({ createElement: element } as unknown as Document);
    const main = element();
    const sidebar = element();
    mountTerminalRoot(mount, main as unknown as HTMLDivElement);
    mountTerminalRoot(mount, sidebar as unknown as HTMLDivElement);

    expect(main.child).toBeUndefined();
    expect(sidebar.child).toBe(mount.root);
    expect(unmountTerminalRoot(mount, main as unknown as HTMLDivElement)).toBe(false);
    expect(sidebar.child).toBe(mount.root);
    expect(unmountTerminalRoot(mount, sidebar as unknown as HTMLDivElement)).toBe(true);
  });
});
