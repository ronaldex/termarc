import { onBeforeUnmount, onMounted, type Ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import { isEditableTarget } from "../utils/dom";
import {
  workspaceContentFocusTarget,
  workspaceShortcutAction,
  type WorkspaceFocusRegion,
} from "../utils/workspaceShortcut";

export type SidebarFocusController = {
  focusTree: () => void;
  hasTreeFocus: () => boolean;
};

export type WorkspaceFocusController = {
  focusContent: () => void;
  hasContentFocus: () => boolean;
};

export type GitSidebarFocusController = {
  focusPanel: () => void;
  hasPanelFocus: () => boolean;
};

export function useWorkspaceShortcuts(options: {
  sidebar: Ref<SidebarFocusController | undefined>;
  workspace: Ref<WorkspaceFocusController | undefined>;
  gitSidebar: Ref<GitSidebarFocusController | undefined>;
  openLeftSidebar: () => void;
  restoreLeftSidebar: () => void;
  toggleLeftSidebar: () => void;
  openRightSidebar: () => void;
  restoreRightSidebar: () => void;
  toggleRightSidebar: () => void;
  closeRightSidebar: () => void;
  gitSidebarAvailable: Ref<boolean>;
  selection: Ref<SidebarSelection>;
  projects: Ref<Project[]>;
  lastProjectId: Ref<string | undefined>;
  isTerminalFocused: () => boolean;
  focusActiveTerminal: () => void;
  selectProject: (project: Project) => void;
  openSettings: () => void;
  cycleTerminal: (direction: -1 | 1) => void;
  activeTerminalAvailable: () => boolean;
  createTerminal: () => void;
  closeActiveTerminal: () => void;
  shouldActivateSidebar: (selection: SidebarSelection) => boolean;
  activateSidebar: (selection: SidebarSelection) => void;
  /** True while a modal owns keyboard input. */
  shortcutScopeActive?: Ref<boolean>;
}): void {
  function currentFocusRegion(): WorkspaceFocusRegion {
    if (options.sidebar.value?.hasTreeFocus()) return "left-sidebar";
    if (options.gitSidebar.value?.hasPanelFocus()) return "right-sidebar";
    if (options.workspace.value?.hasContentFocus()) return "workspace";
    return "other";
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (options.shortcutScopeActive?.value) return;
    const focusRegion = currentFocusRegion();
    const action = workspaceShortcutAction({
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      editableTarget: isEditableTarget(event.target) && !options.isTerminalFocused(),
      focusRegion,
      terminalSelected: options.selection.value.kind === "terminal",
      activeTerminalAvailable: options.activeTerminalAvailable(),
      gitSidebarAvailable: options.gitSidebarAvailable.value,
    });
    if (!action) return;

    if (
      action.type === "cycle-terminal" ||
      action.type === "focus-left-sidebar" ||
      action.type === "focus-workspace-from-left" ||
      action.type === "focus-right-sidebar" ||
      action.type === "focus-workspace-from-right" ||
      action.type === "create-terminal" ||
      action.type === "close-terminal"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    if (action.type === "cycle-terminal") {
      options.cycleTerminal(action.direction);
    } else if (action.type === "create-terminal") {
      options.createTerminal();
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
    } else if (action.type === "focus-workspace-from-left") {
      if (options.shouldActivateSidebar(options.selection.value)) {
        options.activateSidebar(options.selection.value);
      }
      options.restoreLeftSidebar();
      requestAnimationFrame(() => {
        if (!options.isTerminalFocused()) options.workspace.value?.focusContent();
      });
    } else if (action.type === "focus-right-sidebar") {
      options.openRightSidebar();
      requestAnimationFrame(() => options.gitSidebar.value?.focusPanel());
    } else if (action.type === "focus-workspace-from-right") {
      options.restoreRightSidebar();
      requestAnimationFrame(() => {
        const focusTarget = workspaceContentFocusTarget(
          options.activeTerminalAvailable(),
          options.shouldActivateSidebar(options.selection.value),
        );
        if (focusTarget === "terminal") options.focusActiveTerminal();
        else options.workspace.value?.focusContent();
      });
    } else if (action.type === "escape") {
      options.restoreLeftSidebar();
      options.closeRightSidebar();
      if (focusRegion === "right-sidebar") {
        requestAnimationFrame(() => options.workspace.value?.focusContent());
      }
    } else if (action.type === "open-settings") {
      event.preventDefault();
      options.openSettings();
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
    if (!options.gitSidebar.value?.hasPanelFocus()) options.restoreRightSidebar();
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown, { capture: true });
    window.addEventListener("focusin", handleFocusIn);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown, { capture: true });
    window.removeEventListener("focusin", handleFocusIn);
  });
}
