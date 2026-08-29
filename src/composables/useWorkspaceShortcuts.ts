import { onBeforeUnmount, onMounted, type Ref } from "vue";
import type { Project } from "../types/project";
import type { RightSidebarMode } from "../types/rightSidebar";
import type { SidebarSelection } from "../types/sidebar";
import { isEditableTarget } from "../utils/dom";
import {
  workspaceContentFocusTarget,
  workspaceShortcutAction,
  type WorkspaceFocusRegion,
} from "../utils/workspaceShortcut";

export type SidebarFocusController = {
  focusTree: () => void;
  focusSearch: () => void;
  hasTreeFocus: () => boolean;
};

export type WorkspaceFocusController = {
  focusContent: () => void;
  hasContentFocus: () => boolean;
};

export type RightSidebarFocusController = {
  focusPanel: () => void;
  hasPanelFocus: () => boolean;
};

export function useWorkspaceShortcuts(options: {
  sidebar: Ref<SidebarFocusController | undefined>;
  workspace: Ref<WorkspaceFocusController | undefined>;
  rightSidebar: Ref<RightSidebarFocusController | undefined>;
  openLeftSidebar: () => void;
  restoreLeftSidebar: () => void;
  toggleLeftSidebar: () => void;
  focusRightSidebar: () => void;
  focusWorkspaceFromRight: (target: "terminal" | "workspace") => void;
  restoreRightSidebarOnBlur: () => void;
  moveRightSidebarFocus: (direction: -1 | 1) => void;
  cycleSubterminal: (direction: -1 | 1, includeMain: boolean) => void;
  toggleRightSidebar: () => void;
  closeRightSidebar: (routeFocus?: boolean) => void;
  gitSidebarAvailable: Ref<boolean>;
  rightSidebarAvailable: Ref<boolean>;
  rightSidebarMode: Ref<RightSidebarMode>;
  rightSidebarModes: Ref<RightSidebarMode[]>;
  selection: Ref<SidebarSelection>;
  projects: Ref<Project[]>;
  lastProjectId: Ref<string | undefined>;
  isTerminalFocused: () => boolean;
  isSubterminalFocused: () => boolean;
  selectProject: (project: Project) => void;
  openSettings: () => void;
  openKeyboardShortcuts: () => void;
  focusProjectByNumber: (number: number) => void;
  cycleTerminal: (direction: -1 | 1, includeChildren: boolean) => void;
  activeTerminalAvailable: () => boolean;
  createTerminal: () => void;
  createSubterminal: () => void;
  closeActiveTerminal: () => void;
  shouldActivateSidebar: (selection: SidebarSelection) => boolean;
  activateSidebar: (selection: SidebarSelection) => void;
  /** True while a modal owns keyboard input. */
  shortcutScopeActive?: Ref<boolean>;
  shortcutModifier: Ref<"meta" | "ctrl">;
}): void {
  function currentFocusRegion(): WorkspaceFocusRegion {
    if (options.sidebar.value?.hasTreeFocus()) return "left-sidebar";
    if (options.rightSidebar.value?.hasPanelFocus()) return "right-sidebar";
    if (options.workspace.value?.hasContentFocus()) return "workspace";
    return "other";
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (options.shortcutScopeActive?.value) return;
    const focusRegion = currentFocusRegion();
    const rightSidebarModeIndex = options.rightSidebarModes.value.indexOf(
      options.rightSidebarMode.value,
    );
    const action = workspaceShortcutAction({
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shortcutModifier: options.shortcutModifier.value,
      editableTarget: isEditableTarget(event.target) && !options.isTerminalFocused(),
      focusRegion,
      terminalSelected:
        options.selection.value.kind === "terminal" ||
        options.selection.value.kind === "agent" ||
        options.selection.value.kind === "subagent",
      activeTerminalAvailable: options.activeTerminalAvailable(),
      gitSidebarAvailable: options.gitSidebarAvailable.value,
      rightSidebarAvailable: options.rightSidebarAvailable.value,
      rightSidebarHasNextMode:
        rightSidebarModeIndex >= 0 &&
        rightSidebarModeIndex < options.rightSidebarModes.value.length - 1,
      rightSidebarHasPreviousMode: rightSidebarModeIndex > 0,
      subterminalFocused:
        focusRegion === "right-sidebar" &&
        options.rightSidebarMode.value === "subterminals" &&
        options.isSubterminalFocused(),
    });
    if (!action) return;

    if (
      action.type === "cycle-terminal" ||
      action.type === "focus-left-sidebar" ||
      action.type === "focus-workspace-from-left" ||
      action.type === "focus-right-sidebar" ||
      action.type === "focus-workspace-from-right" ||
      action.type === "focus-next-right-sidebar" ||
      action.type === "focus-previous-right-sidebar" ||
      action.type === "cycle-subterminal" ||
      action.type === "focus-process-filter" ||
      action.type === "focus-project" ||
      action.type === "create-terminal" ||
      action.type === "create-subterminal" ||
      action.type === "close-terminal"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    if (action.type === "cycle-terminal") {
      options.cycleTerminal(action.direction, action.includeChildren);
    } else if (action.type === "cycle-subterminal") {
      options.cycleSubterminal(action.direction, action.includeMain);
    } else if (action.type === "create-terminal") {
      options.createTerminal();
    } else if (action.type === "create-subterminal") {
      options.createSubterminal();
    } else if (action.type === "close-terminal") {
      options.closeActiveTerminal();
    } else if (action.type === "focus-left-sidebar") {
      options.openLeftSidebar();
      if (options.selection.value.kind === "app-settings") {
        const project =
          options.projects.value.find((item) => item.id === options.lastProjectId.value) ??
          options.projects.value[0];
        if (project) options.selectProject(project);
      }
      requestAnimationFrame(() => options.sidebar.value?.focusTree());
    } else if (action.type === "focus-process-filter") {
      options.sidebar.value?.focusSearch();
    } else if (action.type === "focus-project") {
      options.focusProjectByNumber(action.number);
    } else if (action.type === "focus-workspace-from-left") {
      if (options.shouldActivateSidebar(options.selection.value)) {
        options.activateSidebar(options.selection.value);
      }
      options.restoreLeftSidebar();
      requestAnimationFrame(() => {
        if (!options.isTerminalFocused()) options.workspace.value?.focusContent();
      });
    } else if (action.type === "focus-right-sidebar") {
      options.focusRightSidebar();
    } else if (
      action.type === "focus-next-right-sidebar" ||
      action.type === "focus-previous-right-sidebar"
    ) {
      options.moveRightSidebarFocus(action.type === "focus-next-right-sidebar" ? 1 : -1);
    } else if (action.type === "focus-workspace-from-right") {
      const focusTarget = workspaceContentFocusTarget(
        options.activeTerminalAvailable(),
        options.shouldActivateSidebar(options.selection.value),
      );
      options.focusWorkspaceFromRight(focusTarget);
    } else if (action.type === "escape") {
      options.restoreLeftSidebar();
      options.closeRightSidebar(focusRegion === "right-sidebar");
    } else if (action.type === "open-settings") {
      event.preventDefault();
      options.openSettings();
      options.restoreLeftSidebar();
      requestAnimationFrame(() => options.workspace.value?.focusContent());
    } else if (action.type === "open-keyboard-shortcuts") {
      event.preventDefault();
      options.openKeyboardShortcuts();
      options.restoreLeftSidebar();
      requestAnimationFrame(() => options.workspace.value?.focusContent());
    } else if (action.type === "toggle-left-sidebar") {
      event.preventDefault();
      options.toggleLeftSidebar();
    } else {
      event.preventDefault();
      options.toggleRightSidebar();
    }
  }

  function handleFocusIn(): void {
    if (!options.sidebar.value?.hasTreeFocus()) options.restoreLeftSidebar();
    options.restoreRightSidebarOnBlur();
  }

  let resizeFocusFrame: number | undefined;
  function handleResize(): void {
    if (resizeFocusFrame !== undefined) cancelAnimationFrame(resizeFocusFrame);
    resizeFocusFrame = requestAnimationFrame(() => {
      resizeFocusFrame = undefined;
      // Resizing does not emit focusin when the terminal already has focus.
      // Reuse the focus policy after the compact media query has updated.
      handleFocusIn();
    });
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown, { capture: true });
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", handleResize);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown, { capture: true });
    window.removeEventListener("focusin", handleFocusIn);
    window.removeEventListener("resize", handleResize);
    if (resizeFocusFrame !== undefined) cancelAnimationFrame(resizeFocusFrame);
  });
}
