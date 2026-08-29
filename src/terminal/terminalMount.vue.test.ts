import { createRenderer, defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { createTerminalMount, createTerminalMountRef } from "./terminalMount";

type HostNode = {
  parentElement?: HostNode;
  children: HostNode[];
  className: string;
  text?: string;
  append(child: HostNode): void;
  remove(): void;
};

function node(): HostNode {
  return {
    children: [],
    className: "",
    append(child) {
      child.remove();
      this.children.push(child);
      child.parentElement = this;
    },
    remove() {
      const index = this.parentElement?.children.indexOf(this) ?? -1;
      if (index >= 0) this.parentElement?.children.splice(index, 1);
      this.parentElement = undefined;
    },
  };
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp() {},
  insert(child, parent, anchor) {
    child.remove();
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(child);
    else parent.children.splice(index, 0, child);
    child.parentElement = parent;
  },
  remove(child) {
    child.remove();
  },
  createElement: node,
  createText(text) {
    return { ...node(), text };
  },
  createComment: node,
  setText(target, text) {
    target.text = text;
  },
  setElementText(target, text) {
    target.text = text;
  },
  parentNode(target) {
    return target.parentElement ?? null;
  },
  nextSibling(target) {
    const siblings = target.parentElement?.children ?? [];
    return siblings[siblings.indexOf(target) + 1] ?? null;
  },
  querySelector() {
    return null;
  },
  setScopeId() {},
  insertStaticContent() {
    const staticNode = node();
    return [staticNode, staticNode];
  },
});

describe("TerminalMount Vue ownership", () => {
  it("keeps a rapid replacement mounted when the old Vue owner unmounts", async () => {
    const mount = createTerminalMount({ createElement: node } as unknown as Document);
    const showWorkspace = ref(true);
    const workspaceOwner = createTerminalMountRef(mount);
    const sidebarOwner = createTerminalMountRef(mount);
    const Component = defineComponent(
      () => () =>
        showWorkspace.value
          ? h("div", { key: "workspace", ref: workspaceOwner as never })
          : h("div", { key: "sidebar", ref: sidebarOwner as never }),
    );
    const host = node();
    const app = renderer.createApp(Component);

    app.mount(host);
    const workspace = mount.target as unknown as HostNode;
    expect(workspace.children).toContain(mount.root as unknown as HostNode);

    showWorkspace.value = false;
    await nextTick();
    const sidebar = mount.target as unknown as HostNode;
    expect(sidebar).not.toBe(workspace);
    expect(sidebar.children).toContain(mount.root as unknown as HostNode);

    // Vue may finish an old branch lifecycle after its replacement has mounted.
    workspaceOwner(null);
    expect(mount.target).toBe(sidebar);
    expect(sidebar.children).toContain(mount.root as unknown as HostNode);

    app.unmount();
    expect(mount.target).toBeUndefined();
    expect((mount.root as unknown as HostNode).parentElement).toBeUndefined();
  });
});
