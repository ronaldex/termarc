<script setup lang="ts">
import { ref, useAttrs } from "vue";
import type { ExternalEditor } from "../../types/settings";
import type { RightSidebarMode } from "../../types/rightSidebar";
import type { TerminalTab } from "../../types/terminal";
import type { GitDiffSummary } from "../../utils/gitDiff";
import type { SidebarPresentation } from "../../composables/useSidebarVisibility";
import GitDiffViewer from "../git/GitDiffViewer.vue";
import RightSidebar from "../sidebar/RightSidebar.vue";
import SubterminalSidebar from "../terminal/SubterminalSidebar.vue";
import WorkspaceMain from "./WorkspaceMain.vue";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    workspaceReady?: boolean;
    tabs: TerminalTab[];
    mainTerminalId?: string;
    terminalContainerRef: (tab: TerminalTab, ownerId: string) => (element: Element | null) => void;
    subterminalIds: string[];
    terminalFamilyId?: string;
    focusedTerminalId?: string;
    rightSidebarOpen: boolean;
    rightSidebarMode: RightSidebarMode;
    rightSidebarModes: RightSidebarMode[];
    rightSidebarPresentation: SidebarPresentation;
    rightSidebarWidth: number;
    showRightSidebar: boolean;
    selectedProjectDirectory?: string;
    terminalFontSize: number;
    externalEditor: ExternalEditor;
  }>(),
  { workspaceReady: true },
);
const emit = defineEmits<{
  selectRightMode: [mode: RightSidebarMode];
  previewRightMode: [];
  collapseRight: [];
  toggleRight: [];
  resizeRight: [event: PointerEvent];
  focusTerminal: [id: string];
  maximizeTerminal: [id: string];
  startTerminal: [id: string];
  terminalLayout: [];
  gitAvailable: [available: boolean];
}>();
const attrs = useAttrs();
const workspaceMain = ref<InstanceType<typeof WorkspaceMain>>();
const rightSidebar = ref<InstanceType<typeof RightSidebar>>();
const subterminalSidebar = ref<InstanceType<typeof SubterminalSidebar>>();
const gitSummary = ref<{
  summary: GitDiffSummary;
  loading: boolean;
  error?: string;
}>();

function focusContent(): void {
  workspaceMain.value?.focusContent();
}
function hasContentFocus(): boolean {
  return workspaceMain.value?.hasContentFocus() ?? false;
}
function focusPanel(): void {
  void rightSidebar.value?.focusPanel();
}
function hasPanelFocus(): boolean {
  return rightSidebar.value?.hasPanelFocus() ?? false;
}
function focusSubterminalPanel(): void {
  void subterminalSidebar.value?.focusPanel();
}
function hasSubterminalFocus(): boolean {
  return subterminalSidebar.value?.hasPanelFocus() ?? false;
}

defineExpose({
  focusContent,
  hasContentFocus,
  focusPanel,
  hasPanelFocus,
  focusSubterminalPanel,
  hasSubterminalFocus,
});
</script>

<template>
  <WorkspaceMain
    v-bind="attrs"
    ref="workspaceMain"
    :workspace-ready="workspaceReady"
    :tabs="tabs"
    :main-terminal-id="mainTerminalId"
    :terminal-container-ref="terminalContainerRef"
    @focus-terminal="emit('focusTerminal', $event)"
    @start-terminal="emit('startTerminal', $event)"
  />
  <div
    v-if="rightSidebarPresentation !== 'collapsed' && rightSidebarModes.length"
    class="resize-handle right-resize"
    :class="{ 'overlay-resize': rightSidebarPresentation === 'overlay' }"
    title="Resize right sidebar"
    @pointerdown="emit('resizeRight', $event)"
  />
  <RightSidebar
    v-if="showRightSidebar || rightSidebarModes.length"
    ref="rightSidebar"
    :class="{ overlay: rightSidebarPresentation === 'overlay' }"
    :style="{
      width: rightSidebarOpen
        ? rightSidebarPresentation === 'overlay'
          ? `${rightSidebarWidth}%`
          : '100%'
        : 'var(--sidebar-collapsed-width)',
    }"
    :active="rightSidebarOpen"
    :mode="rightSidebarMode"
    :modes="rightSidebarModes"
    :subterminal-count="subterminalIds.length"
    :git-summary="gitSummary"
    @select="emit('selectRightMode', $event)"
    @preview="emit('previewRightMode')"
    @collapse="emit('collapseRight')"
    @toggle="emit('toggleRight')"
  >
    <SubterminalSidebar
      :key="terminalFamilyId"
      ref="subterminalSidebar"
      :hidden="rightSidebarMode !== 'subterminals'"
      data-mode-content
      :tabs="tabs"
      :tab-ids="subterminalIds"
      :focused-terminal-id="focusedTerminalId"
      :terminal-container-ref="terminalContainerRef"
      @focus="emit('focusTerminal', $event)"
      @maximize="emit('maximizeTerminal', $event)"
      @start="emit('startTerminal', $event)"
      @layout="emit('terminalLayout')"
    />
    <GitDiffViewer
      :hidden="rightSidebarMode !== 'git'"
      data-mode-content
      :directory="selectedProjectDirectory"
      :active="rightSidebarOpen && rightSidebarMode === 'git'"
      :font-size="terminalFontSize"
      :external-editor="externalEditor"
      @available="emit('gitAvailable', $event)"
      @summary="gitSummary = $event"
    />
  </RightSidebar>
</template>
