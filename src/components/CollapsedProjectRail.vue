<script setup lang="ts">
import { computed, ref } from "vue";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { projectRailSummaries } from "../utils/sidebarSummary";
import OverlayScrollArea from "./OverlayScrollArea.vue";
import ProjectBadge from "./ProjectBadge.vue";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{
  projects: ProjectTreeProject[];
  tabs: TerminalTabState[];
  selection: SidebarSelection;
}>();
const emit = defineEmits<{
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

const summaries = computed(() => projectRailSummaries(props.projects, props.tabs, props.selection));
const activeItem = ref<HTMLButtonElement>();

function setActiveItem(element: Element | null, id: string): void {
  if (id === props.selection.id && element instanceof HTMLButtonElement) activeItem.value = element;
}

function focusActiveItem(): boolean {
  activeItem.value?.focus();
  return document.activeElement === activeItem.value;
}

defineExpose({ focusActiveItem });
</script>

<template>
  <OverlayScrollArea class="project-rail-scroll">
    <nav class="project-rail" aria-label="Projects and terminals">
      <section v-for="project in summaries" :key="project.id" class="rail-project">
        <button
          :ref="(element) => setActiveItem(element, project.selection.id)"
          class="rail-project-button"
          :class="{ selected: project.selected }"
          type="button"
          :title="`${project.name} · ${project.tabs.length} open ${project.tabs.length === 1 ? 'process' : 'processes'}`"
          :aria-label="`${project.name}, ${project.tabs.length} open ${project.tabs.length === 1 ? 'process' : 'processes'}`"
          :aria-current="project.selected ? 'true' : undefined"
          @click="emit('focus', project.selection)"
        >
          <ProjectBadge :name="project.name" />
        </button>

        <div v-if="project.tabs.length" class="rail-terminals">
          <button
            v-for="tab in project.tabs"
            :key="tab.id"
            :ref="(element) => setActiveItem(element, tab.selection.id)"
            class="rail-terminal-button"
            :class="{ selected: tab.selected }"
            type="button"
            :title="`${tab.command ? 'Command' : 'Terminal'} ${tab.number}: ${tab.label}`"
            :aria-label="`${tab.command ? 'Command' : 'Terminal'} ${tab.number}: ${tab.label}`"
            :aria-current="tab.selected ? 'true' : undefined"
            @click="emit('activate', tab.selection)"
          >
            <TerminalStatusIndicator
              class="terminal-status"
              :status="tab.status"
              :busy="tab.busy"
              :running="tab.running"
            />
            <span class="terminal-shortcut">⌘{{ tab.number }}</span>
          </button>
        </div>
      </section>
    </nav>
  </OverlayScrollArea>
</template>

<style scoped>
.project-rail-scroll {
  min-height: 0;
  flex: 1;
}
.project-rail {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  padding: 0.375rem 0;
}
.rail-project {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  padding: 0.25rem 0;
}
.rail-project + .rail-project {
  border-top: 1px solid var(--color-border-muted);
}
button {
  position: relative;
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: 0 0 2rem;
  padding: 0;
  border: 0;
  border-radius: 0.375rem;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}
button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
button:focus-visible {
  outline: 1px solid var(--color-focus);
  outline-offset: 1px;
}
button.selected {
  color: var(--color-text-strong);
  background: var(--color-accent-bg);
}
.rail-terminal-button.selected {
  background: transparent;
}
.rail-terminal-button.selected::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: -0.375rem;
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.rail-project-button {
  width: 1.5rem;
  height: 1.5rem;
  flex-basis: 1.5rem;
  border: 2px solid transparent;
  border-radius: 0.375rem;
}
.rail-project-button.selected {
  border-color: var(--color-accent-bg);
  background: transparent;
}
.terminal-status {
  position: static;
}
.rail-terminals {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  margin-top: 0.25rem;
}
.rail-terminal-button {
  display: flex;
  width: 2.25rem;
  height: 1.75rem;
  flex-basis: 1.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
}
.terminal-shortcut {
  color: var(--color-text-faint);
  font-size: 0.625rem;
}
</style>
