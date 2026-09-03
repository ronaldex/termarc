<script setup lang="ts">
import { nextTick, ref } from "vue";
import type { RightSidebarMode } from "../../types/rightSidebar";
import type { GitDiffSummary } from "../../utils/gitDiff";
import SidebarChevron from "./SidebarChevron.vue";

const props = defineProps<{
  active: boolean;
  mode: RightSidebarMode;
  modes: RightSidebarMode[];
  subterminalCount: number;
  gitSummary?: {
    summary: GitDiffSummary;
    loading: boolean;
    error?: string;
  };
}>();
const emit = defineEmits<{
  select: [mode: RightSidebarMode];
  preview: [];
  collapse: [];
  toggle: [];
}>();
const panel = ref<HTMLElement>();
const labels: Record<RightSidebarMode, string> = { subterminals: "Subterminals", git: "Changes" };
function modeSummaryLabel(mode: RightSidebarMode): string {
  if (mode === "subterminals") {
    return `${props.subterminalCount} ${props.subterminalCount === 1 ? "subterminal" : "subterminals"}`;
  }
  if (props.gitSummary?.error) return `Git changes unavailable: ${props.gitSummary.error}`;
  const summary = props.gitSummary?.summary;
  if (!summary?.files)
    return props.gitSummary?.loading ? "Refreshing Git changes" : "No Git changes";
  return `${summary.files} changed ${summary.files === 1 ? "file" : "files"}, ${summary.additions} additions, ${summary.deletions} deletions`;
}
function choose(mode: RightSidebarMode): void {
  emit("select", mode);
  emit("preview");
}
function toggle(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggle");
}
async function focusPanel(): Promise<void> {
  await nextTick();
  const activeContent = panel.value?.querySelector<HTMLElement>(
    "[data-mode-content]:not([hidden])",
  );
  const candidate =
    activeContent?.querySelector<HTMLElement>(".xterm-helper-textarea") ??
    activeContent?.querySelector<HTMLElement>(".stopped-pane button") ??
    activeContent?.querySelector<HTMLElement>("button:not(.maximize-button)") ??
    panel.value?.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
  (candidate ?? panel.value)?.focus({ preventScroll: true });
}
function hasPanelFocus(): boolean {
  return panel.value?.contains(document.activeElement) ?? false;
}
defineExpose({ focusPanel, hasPanelFocus });
</script>

<template>
  <aside
    ref="panel"
    class="right-sidebar"
    :class="{ collapsed: !active }"
    aria-label="Right sidebar"
    tabindex="-1"
  >
    <div v-if="!active" class="right-sidebar-rail">
      <div v-for="availableMode in modes" :key="availableMode" class="right-sidebar-mode">
        <button
          type="button"
          class="right-sidebar-mode-button"
          :title="`${modeSummaryLabel(availableMode)}. Preview ${labels[availableMode]}`"
          :aria-label="`${modeSummaryLabel(availableMode)}. Preview ${labels[availableMode]}`"
          @click="choose(availableMode)"
        >
          <svg
            v-if="availableMode === 'subterminals'"
            class="right-sidebar-mode-icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
            <path d="m5 6 2 2-2 2M8.5 10h2.5" />
          </svg>
          <span v-else aria-hidden="true">⑂</span>
          <span
            v-if="availableMode === 'subterminals' || gitSummary?.summary.files"
            class="right-sidebar-count"
          >
            {{ availableMode === "subterminals" ? subterminalCount : gitSummary?.summary.files }}
          </span>
          <span
            v-else-if="availableMode === 'git' && gitSummary?.error"
            class="right-sidebar-count error"
            >!</span
          >
          <span
            v-else-if="availableMode === 'git' && gitSummary?.loading"
            class="right-sidebar-count loading"
            >…</span
          >
        </button>
        <div
          v-if="availableMode === 'git' && gitSummary?.summary.files"
          class="right-sidebar-line-summary"
          :title="modeSummaryLabel(availableMode)"
          aria-hidden="true"
        >
          <span class="additions">+{{ gitSummary.summary.additions }}</span>
          <span class="deletions">−{{ gitSummary.summary.deletions }}</span>
        </div>
      </div>
      <footer class="right-sidebar-rail-footer">
        <SidebarChevron direction="left" title="Show sidebar (⌘D)" @click="toggle" />
      </footer>
    </div>
    <div class="right-sidebar-content" :hidden="!active"><slot /></div>
    <footer v-if="active" class="right-sidebar-footer">
      <div role="tablist" aria-label="Right sidebar views">
        <button
          v-for="availableMode in modes"
          :key="availableMode"
          role="tab"
          type="button"
          :aria-selected="mode === availableMode"
          @click="emit('select', availableMode)"
        >
          {{ labels[availableMode] }}
        </button>
      </div>
      <SidebarChevron title="Hide sidebar (⌘D)" @click="emit('collapse')" />
    </footer>
  </aside>
</template>

<style scoped>
.right-sidebar {
  --line: var(--color-border);
  display: flex;
  min-width: 0;
  flex-direction: column;
  color: var(--color-text);
  background: var(--sidebar-background);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.right-sidebar.collapsed {
  width: var(--sidebar-collapsed-width) !important;
  border-left: 1px solid var(--color-border-muted);
}
.right-sidebar-rail {
  display: flex;
  height: 100%;
  align-items: center;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.5rem;
}
.right-sidebar-rail button,
.right-sidebar-footer button {
  border: 0;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
.right-sidebar-mode {
  display: flex;
  align-items: center;
  flex-direction: column;
}
.right-sidebar-mode-button {
  position: relative;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
}
.right-sidebar-mode-icon {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
}
.right-sidebar-count {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  min-width: 0.875rem;
  height: 0.875rem;
  padding: 0 0.1875rem;
  border-radius: 0.4375rem;
  color: var(--color-text-strong);
  background: var(--color-surface-emphasis);
  font-size: 0.5rem;
  line-height: 0.875rem;
}
.right-sidebar-count.error {
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
.right-sidebar-count.loading {
  color: var(--color-accent-hover);
  background: var(--color-accent-bg);
}
.right-sidebar-line-summary {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 0.0625rem;
  padding-bottom: 0.25rem;
  font-family: "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5rem;
}
.right-sidebar-line-summary .additions {
  color: var(--color-status-running);
}
.right-sidebar-line-summary .deletions {
  color: var(--color-status-error);
}
.right-sidebar-rail-footer {
  display: flex;
  width: 100%;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--line);
  background: var(--panel-footer-background);
}
.right-sidebar-mode-button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
.right-sidebar-footer {
  display: flex;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  padding: 0 0.9375rem 0 0;
  border-top: 1px solid var(--line);
  background: var(--panel-footer-background);
}
.right-sidebar-footer [role="tablist"] {
  display: flex;
  min-width: 0;
  flex: 1;
  height: 100%;
}
.right-sidebar-footer [role="tab"] {
  padding: 0 0.75rem;
  border-bottom: 2px solid transparent;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
}
.right-sidebar-footer [role="tab"]:hover {
  color: var(--color-text-strong);
}
.right-sidebar-footer [role="tab"][aria-selected="true"] {
  border-bottom-color: var(--color-accent);
  color: var(--color-text-strong);
}
.right-sidebar-content {
  min-height: 0;
  flex: 1;
  background: var(--color-app-bg);
}
.right-sidebar-content :deep(> [data-mode-content]) {
  height: 100%;
  min-height: 0;
}
.right-sidebar-content :deep(> [data-mode-content][hidden]) {
  display: none !important;
}
</style>
