<script setup lang="ts">
import { nextTick, ref } from "vue";
import type { RightSidebarMode } from "../../types/rightSidebar";
import SidebarChevron from "./SidebarChevron.vue";

const props = defineProps<{
  active: boolean;
  mode: RightSidebarMode;
  modes: RightSidebarMode[];
}>();
const emit = defineEmits<{
  select: [mode: RightSidebarMode];
  preview: [];
  collapse: [];
  toggle: [];
}>();
const panel = ref<HTMLElement>();
const labels: Record<RightSidebarMode, string> = { subterminals: "Subterminals", git: "Changes" };
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
      <button
        v-for="availableMode in modes"
        :key="availableMode"
        type="button"
        class="right-sidebar-mode-button"
        :title="`Preview ${labels[availableMode]}`"
        :aria-label="`Preview ${labels[availableMode]}`"
        @click="choose(availableMode)"
      >
        {{ availableMode === "subterminals" ? "⌘" : "⑂" }}
      </button>
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
.right-sidebar-rail > button {
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
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
