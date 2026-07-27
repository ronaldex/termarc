<script setup lang="ts">
import { computed, nextTick, ref, toRefs } from "vue";
import { useProjectTreeNavigation } from "../composables/useProjectTreeNavigation";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import ProjectTree from "./ProjectTree.vue";
import SidebarFooter from "./SidebarFooter.vue";

const props = defineProps<{
  tabs: TerminalTabState[];
  collapsed?: boolean;
  projects: ProjectTreeProject[];
  selection: SidebarSelection;
  isTerminalFocused: () => boolean;
}>();
const emit = defineEmits<{
  manage: [projectId?: string];
  close: [id: string];
  rename: [id: string, name: string];
  toggle: [];
  addProject: [];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

const filter = ref("");
const sidebarElement = ref<HTMLElement>();
const projectTree = ref<InstanceType<typeof ProjectTree>>();
const searchInput = ref<HTMLInputElement>();
const { projects, tabs, selection, collapsed } = toRefs(props);
const treeFilter = computed(() => (collapsed.value ? "" : filter.value));

function focusTree(): void {
  const focused = projectTree.value?.focusActiveItem();
  if (!focused) sidebarElement.value?.focus();
}

async function focusSearch(): Promise<void> {
  if (props.collapsed) emit("toggle");
  await nextTick();
  searchInput.value?.focus();
}

function hasTreeFocus(): boolean {
  return sidebarElement.value?.contains(document.activeElement) ?? false;
}

function closeTerminal(id: string): void {
  emit("close", id);
  requestAnimationFrame(focusTree);
}

function choose(node: SidebarSelection): void {
  const terminalWasFocused = props.isTerminalFocused();
  emit("focus", node);
  if (terminalWasFocused && node.kind === "terminal" && node.tabId) {
    emit("activate", node);
    return;
  }
  requestAnimationFrame(focusTree);
}

defineExpose({ focusTree, hasTreeFocus });

useProjectTreeNavigation({
  projects,
  tabs,
  filter: treeFilter,
  selection,
  sidebarElement,
  onAction(action) {
    if (action.type === "focus") choose(action.selection);
    else if (action.type === "activate") emit("activate", action.selection);
    else if (action.type === "toggle-project") emit("toggleProject", action.projectId);
    else if (action.type === "toggle-terminals") emit("toggleTerminals", action.projectId);
    else emit("toggleCommands", action.projectId);
  },
});
</script>

<template>
  <aside
    ref="sidebarElement"
    class="sidebar"
    :class="{ collapsed }"
    tabindex="-1"
    aria-label="Project tree"
  >
    <div class="filter-row" :class="{ compact: collapsed }">
      <button
        class="search-button"
        type="button"
        :title="collapsed ? 'Search processes' : 'Focus process filter'"
        aria-label="Search processes"
        @click="focusSearch"
      >
        <span class="search-icon" aria-hidden="true"></span>
      </button>
      <input
        v-if="!collapsed"
        ref="searchInput"
        v-model="filter"
        type="search"
        placeholder="Filter processes..."
        aria-label="Filter processes"
      />
      <button v-if="!collapsed" title="Manage projects" @click="emit('manage')">⋮</button>
    </div>

    <ProjectTree
      ref="projectTree"
      :projects="projects"
      :tabs="tabs"
      :filter="treeFilter"
      :selection="selection"
      :collapsed="collapsed"
      @close="closeTerminal"
      @rename="(id, name) => emit('rename', id, name)"
      @toggle-project="emit('toggleProject', $event)"
      @toggle-terminals="emit('toggleTerminals', $event)"
      @toggle-commands="emit('toggleCommands', $event)"
      @run-command="(projectId, commandId) => emit('runCommand', projectId, commandId)"
      @reload-command="(projectId, commandId) => emit('reloadCommand', projectId, commandId)"
      @stop-command="(projectId, commandId) => emit('stopCommand', projectId, commandId)"
      @focus="choose"
      @activate="emit('activate', $event)"
    />

    <SidebarFooter :collapsed="collapsed" @toggle="emit('toggle')" @add="emit('addProject')" />
  </aside>
</template>

<style scoped>
.sidebar {
  --bg: var(--color-sidebar-bg);
  --line: var(--color-border);
  --muted: var(--color-text-subtle);
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  color: var(--color-text);
  background: var(--sidebar-background);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  user-select: none;
}
.sidebar.collapsed {
  width: var(--sidebar-collapsed-width) !important;
  align-items: stretch;
  border-right: 1px solid var(--color-border-muted);
}
.sidebar:focus,
.sidebar:focus-visible {
  outline: none;
}
button,
input {
  font: inherit;
}
button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.filter-row {
  display: flex;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.875rem 0 1.125rem;
  border-bottom: 1px solid var(--line);
}
.search-button {
  display: grid;
  width: 1rem;
  height: 1.75rem;
  flex: 0 0 1rem;
  padding: 0;
  place-items: center;
}
.filter-row.compact {
  justify-content: center;
  gap: 0;
  padding: 0;
}
.search-icon {
  position: relative;
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 0.875rem;
  border: 1.5px solid var(--color-text-muted);
  border-radius: 50%;
}
.search-icon::after {
  position: absolute;
  right: -0.25rem;
  bottom: -0.125rem;
  width: 0.375rem;
  height: 0.1rem;
  background: var(--color-text-muted);
  content: "";
  transform: rotate(45deg);
}
.filter-row input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 0.75rem;
}
.filter-row input::placeholder {
  color: var(--color-text-faint);
}
.filter-row input::-webkit-search-cancel-button {
  display: none;
}
.filter-row > button:not(.search-button) {
  padding: 0.25rem 0.5rem;
  color: var(--color-text-faint);
  font-size: 0.875rem;
}
.search-button:hover .search-icon {
  border-color: var(--color-text);
}
.search-button:hover .search-icon::after {
  background: var(--color-text);
}
</style>
