import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import { useTerminalPresentation } from "./useTerminalPresentation";

function tab(id: string, parentTerminalId?: string): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId: "project",
    cwd: "/project",
    parentTerminalId,
    launch: { kind: "shell" },
    status: "running",
  };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

describe("useTerminalPresentation", () => {
  it("keeps family presentation stable and explicitly promotes a child", () => {
    const tabs = [tab("root"), tab("child", "root"), tab("other")];
    const mainTerminalId = ref<string>();
    const activeTabId = ref<string>();
    const selected: string[] = [];
    const reset = vi.fn();
    const presentation = useTerminalPresentation({
      tabs,
      mainTerminalId,
      activeTabId,
      selectTab: (id) => selected.push(id),
      focusTerminal: vi.fn(),
      focusWorkspaceContent: vi.fn(),
      focusSidebarPanel: vi.fn(),
      fitAfterLayout: vi.fn(),
      resetRightSidebarMode: reset,
    });

    presentation.present("child");
    expect(mainTerminalId.value).toBe("root");
    expect(presentation.sidebarIds.value).toEqual(["child"]);

    presentation.maximize("child");
    expect(mainTerminalId.value).toBe("child");
    expect(selected).toEqual(["child"]);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("cycles through the canonical family order", () => {
    const tabs = [tab("root"), tab("one", "root"), tab("two", "root")];
    const mainTerminalId = ref<string | undefined>("root");
    const activeTabId = ref<string | undefined>("one");
    const selected: string[] = [];
    const presentation = useTerminalPresentation({
      tabs,
      mainTerminalId,
      activeTabId,
      selectTab(id) {
        activeTabId.value = id;
        selected.push(id);
      },
      focusTerminal: vi.fn(),
      focusWorkspaceContent: vi.fn(),
      focusSidebarPanel: vi.fn(),
      fitAfterLayout: vi.fn(),
      resetRightSidebarMode: vi.fn(),
    });

    presentation.cycle(1, true);
    expect(selected).toEqual(["two"]);
    presentation.cycle(1, true);
    expect(selected).toEqual(["two", "root"]);
  });
});
