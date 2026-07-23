import { onBeforeUnmount, onMounted, type Ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import { isEditableTarget } from "../utils/dom";

export type SidebarFocusController = {
  focusTree: () => void;
  hasTreeFocus: () => boolean;
};

export type WorkspaceFocusController = {
  focusContent: () => void;
  hasContentFocus: () => boolean;
};

export function useWorkspaceShortcuts(options: {
  sidebar: Ref<SidebarFocusController | undefined>;
  workspace: Ref<WorkspaceFocusController | undefined>;
  leftSidebarOpen: Ref<boolean>;
  rightSidebarOpen: Ref<boolean>;
  gitSidebarAvailable: Ref<boolean>;
  selection: Ref<SidebarSelection>;
  projects: Ref<Project[]>;
  lastProjectId: Ref<string | undefined>;
  isTerminalFocused: () => boolean;
  selectProject: (project: Project) => void;
  openSettings: () => void;
  shouldActivateSidebar: (selection: SidebarSelection) => boolean;
  activateSidebar: (selection: SidebarSelection) => void;
}): void {
  function handleKeydown(event: KeyboardEvent): void {
    const editableTarget = isEditableTarget(event.target) && !options.isTerminalFocused();
    if (
      !editableTarget &&
      event.metaKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      if (event.key === "ArrowLeft" && options.workspace.value?.hasContentFocus()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        options.leftSidebarOpen.value = true;
        if (options.selection.value.kind === "app-settings") {
          const project =
            options.projects.value.find((item) => item.id === options.lastProjectId.value) ??
            options.projects.value[0];
          if (project) options.selectProject(project);
        }
        requestAnimationFrame(() => options.sidebar.value?.focusTree());
      } else if (event.key === "ArrowRight" && options.sidebar.value?.hasTreeFocus()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (options.shouldActivateSidebar(options.selection.value)) {
          options.activateSidebar(options.selection.value);
        }
        requestAnimationFrame(() => {
          if (!options.isTerminalFocused()) options.workspace.value?.focusContent();
        });
      }
      return;
    }

    if (event.metaKey && event.key === ",") {
      event.preventDefault();
      options.openSettings();
      requestAnimationFrame(() => options.workspace.value?.focusContent());
    }
    if (event.metaKey && event.key.toLowerCase() === "d" && options.gitSidebarAvailable.value) {
      event.preventDefault();
      options.rightSidebarOpen.value = !options.rightSidebarOpen.value;
    }
  }

  onMounted(() => window.addEventListener("keydown", handleKeydown, { capture: true }));
  onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown, { capture: true }));
}
