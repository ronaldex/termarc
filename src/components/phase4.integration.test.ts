// @vitest-environment happy-dom

import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRightSidebarController } from "../composables/useRightSidebarController";
import { useTerminalPresentation } from "../composables/useTerminalPresentation";
import type { Project, ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import { createTerminalMount, createTerminalMountRef } from "../terminal/terminalMount";
import ProjectTree from "./sidebar/ProjectTree.vue";
import ParentCloseDialog from "./terminal/ParentCloseDialog.vue";
import TerminalPresentationShell from "./workspace/TerminalPresentationShell.vue";

type Mounted = { host: HTMLDivElement; unmount: () => void };
const mounted: Mounted[] = [];

function mount(component: Parameters<typeof createApp>[0]): Mounted {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp(component);
  app.mount(host);
  const result = { host, unmount: () => app.unmount() };
  mounted.push(result);
  return result;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function renderSettled(): Promise<void> {
  await nextTick();
  await nextTick();
}

afterEach(() => {
  for (const item of mounted.splice(0)) item.unmount();
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 4 application-level mounted integration", () => {
  it("uses the production presentation shell for canonical promotion, focus, and stale-safe TerminalMount relocation", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const focusFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      focusFrames.push(callback);
      return focusFrames.length;
    });
    const flushFocus = () => focusFrames.splice(0).forEach((callback) => callback(0));

    function runtimeTab(
      id: string,
      title: string,
      parentTerminalId?: string,
      launch: TerminalTab["launch"] = { kind: "shell" },
    ): TerminalTab {
      const mount = createTerminalMount();
      const textarea = document.createElement("textarea");
      textarea.className = "xterm-helper-textarea";
      mount.root.append(textarea);
      const terminal = {
        focus: () => textarea.focus(),
        hasSelection: () => false,
        dispose: vi.fn(),
      } as unknown as TerminalTab["terminal"];
      return {
        id,
        projectId: "project",
        number: id === "parent" ? 1 : 2,
        title,
        launchTitle: title,
        cwd: "/project",
        currentCwd: "/project",
        detail: "running",
        status: "running",
        terminal,
        launch,
        parentTerminalId,
        mount,
      } as TerminalTab;
    }

    const parent = runtimeTab("parent", "Parent");
    const child = runtimeTab("child", "Child agent", undefined, {
      kind: "subagent",
      subagentId: "agent-1",
      parentTerminalId: parent.id,
      name: "Child agent",
      commandLine: "pi",
      processKind: "pi",
    });
    const tabs = reactive([parent, child]);
    const project: Project = {
      id: "project",
      name: "Project",
      directory: "/project",
      commands: [],
      terminals: [{ id: parent.id }],
    };
    const treeProjects: ProjectTreeProject[] = [
      {
        ...project,
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
        agentsOpen: true,
      },
    ];
    const selection = ref<SidebarSelection>({
      id: parent.id,
      kind: "terminal",
      projectId: "project",
      tabId: parent.id,
    });
    const activeTabId = ref<string>();
    const mainTerminalId = ref<string>(parent.id);
    const rightOpen = ref(true);
    const gitAvailable = ref(true);
    const shell = ref<{
      focusContent: () => void;
      focusPanel: () => void;
      hasPanelFocus: () => boolean;
      focusSubterminalPanel: () => void;
      hasSubterminalFocus: () => boolean;
    }>();
    const stopped = vi.fn();
    const tree = ref<{ focusActiveItem: () => boolean }>();
    const owners = new Map<string, (element: Element | null) => void>();
    const terminalContainerRef = (tab: TerminalTab, ownerId: string) => {
      const key = `${tab.id}:${ownerId}`;
      let owner = owners.get(key);
      if (!owner) {
        owner = createTerminalMountRef(tab.mount);
        owners.set(key, owner);
      }
      return owner;
    };
    let controller!: ReturnType<typeof useRightSidebarController>;
    const presentation = useTerminalPresentation({
      tabs,
      activeTabId,
      mainTerminalId,
      selectTab: (id) => {
        activeTabId.value = id;
      },
      focusTerminal: () => tabs.find((tab) => tab.id === activeTabId.value)?.terminal.focus(),
      focusWorkspaceContent: () => shell.value?.focusContent(),
      focusSidebarPanel: () => shell.value?.focusSubterminalPanel(),
      fitAfterLayout: vi.fn(),
      resetRightSidebarMode: () => controller.resetOpenMode(),
    });
    controller = useRightSidebarController({
      subterminalsAvailable: ref(true),
      gitAvailable,
      open: rightOpen,
      openTemporarily: () => {
        rightOpen.value = true;
      },
      restorePreference: vi.fn(),
      toggle: () => {
        rightOpen.value = !rightOpen.value;
      },
      close: () => {
        rightOpen.value = false;
      },
      focusPanel: () => shell.value?.focusPanel(),
      hasPanelFocus: () => shell.value?.hasPanelFocus() ?? false,
      focusWorkspace: () => shell.value?.focusContent(),
      focusTerminal: presentation.focusMain,
    });

    function choose(next: SidebarSelection): void {
      selection.value = next;
      if (next.kind !== "terminal" && next.kind !== "subagent") return;
      presentation.focusFamily(next.tabId);
      if (next.tabId !== mainTerminalId.value) controller.openAndFocus("subterminals");
    }

    const Harness = defineComponent({
      name: "Phase4ProductionShellHarness",
      setup: () => () =>
        h("main", { class: "phase4-app-harness" }, [
          h(ProjectTree, {
            ref: tree,
            projects: treeProjects,
            tabs,
            shortcutModifier: "meta",
            filter: "",
            selection: selection.value,
            onFocus: choose,
            onActivate: choose,
            onStopSubagent: (id: string) => stopped(id),
          }),
          h(TerminalPresentationShell, {
            ref: shell,
            selection: selection.value,
            selectedProject: project,
            projects: [project],
            tabs,
            mainTerminalId: mainTerminalId.value,
            isEmpty: false,
            terminalContainerRef,
            subterminalIds: presentation.sidebarIds.value,
            terminalFamilyId: presentation.family.value?.rootTabId,
            focusedTerminalId: activeTabId.value,
            rightSidebarOpen: controller.open.value,
            rightSidebarMode: controller.mode.value,
            rightSidebarModes: controller.modes.value,
            rightSidebarPresentation: "docked",
            rightSidebarWidth: 40,
            showRightSidebar: true,
            selectedProjectDirectory: project.directory,
            terminalFontSize: 13,
            externalEditor: "vscodium",
            onFocusTerminal: presentation.focusFamily,
            onMaximizeTerminal: presentation.maximize,
            onStartTerminal: vi.fn(),
            onTerminalLayout: vi.fn(),
            onSelectRightMode: controller.select,
            onPreviewRightMode: () => controller.preview(),
            onCollapseRight: () => controller.close(),
            onToggleRight: controller.toggle,
            onGitAvailable: (available: boolean) => {
              gitAvailable.value = available;
            },
          }),
        ]),
    });
    const { host } = mount(Harness);
    await renderSettled();

    expect(presentation.family.value).toEqual({
      rootTabId: "parent",
      memberTabIds: ["parent", "child"],
    });
    expect(presentation.sidebarIds.value).toEqual(["child"]);
    expect(child.mount.target?.closest(".subterminal-pane")?.getAttribute("data-pane-id")).toBe(
      "child",
    );

    const childRow = [...host.querySelectorAll<HTMLButtonElement>(".tree-item-select")].find(
      (button) => button.textContent?.includes("Child agent"),
    )!;
    click(childRow);
    await renderSettled();
    flushFocus();
    await renderSettled();
    expect(selection.value).toMatchObject({ kind: "subagent", tabId: "child" });
    expect(activeTabId.value).toBe("child");
    expect(mainTerminalId.value).toBe("parent");
    expect(tree.value!.focusActiveItem()).toBe(true);
    expect(document.activeElement).toBe(childRow);

    controller.openAndFocus("subterminals");
    flushFocus();
    await renderSettled();
    expect(document.activeElement).toBe(child.mount.root.querySelector("textarea"));
    expect(shell.value!.hasSubterminalFocus()).toBe(true);

    controller.moveAndFocus(1);
    flushFocus();
    await renderSettled();
    expect(controller.mode.value).toBe("git");
    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    controller.moveAndFocus(-1);
    flushFocus();
    await renderSettled();

    click(host.querySelector('[aria-label="Show Child agent as main terminal"]')!);
    await renderSettled();
    expect(mainTerminalId.value).toBe("child");
    expect(presentation.sidebarIds.value).toEqual(["parent"]);
    expect(child.mount.target?.classList.contains("terminal-instance")).toBe(true);
    expect(host.querySelectorAll(".terminal-runtime-root")).toHaveLength(2);

    const staleWorkspaceOwner = owners.get("child:workspace")!;
    presentation.maximize("parent");
    await renderSettled();
    expect(child.mount.target?.classList.contains("terminal-target")).toBe(true);
    staleWorkspaceOwner(null);
    expect(child.mount.target?.classList.contains("terminal-target")).toBe(true);

    presentation.maximize("child");
    await renderSettled();
    presentation.maximize("parent");
    await renderSettled();
    expect(child.mount.root.parentElement).toBe(child.mount.target);
    expect(host.querySelectorAll(".terminal-runtime-root")).toHaveLength(2);

    click(host.querySelector('[aria-label="Stop subagent"]')!);
    expect(stopped).toHaveBeenCalledWith("child");
  });

  it("mounts the terminal-close dialog, focuses it, and emits every close choice", async () => {
    const choose = vi.fn();
    mount(h(ParentCloseDialog, { childCount: 2, runningProcessCount: 1, onChoose: choose }));
    await renderSettled();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog);
    expect(dialog.textContent).toContain("2 subterminals");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    click(
      [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Close terminal"),
      )!,
    );
    document
      .querySelector<HTMLElement>(".parent-close-backdrop")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(choose.mock.calls.map(([choice]) => choice)).toEqual(["cancel", "close", "cancel"]);
  });
});
