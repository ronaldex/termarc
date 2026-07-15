<script setup lang="ts">
import { ref, toRefs } from "vue";
import { useProjectTreeNavigation } from "../composables/useProjectTreeNavigation";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import ProjectTree from "./ProjectTree.vue";
import SidebarFooter from "./SidebarFooter.vue";

const props = defineProps<{
  tabs: TerminalTab[];
  collapsed?: boolean;
  projects: Project[];
  selection: SidebarSelection;
}>();
const emit = defineEmits<{
  manage: [projectId?: string];
  close: [id: string];
  toggle: [];
  addProject: [];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

const filter = ref("");
const sidebarElement = ref<HTMLElement>();
const { projects, tabs, selection } = toRefs(props);

function choose(node: SidebarSelection): void {
  emit("focus", node);
  requestAnimationFrame(() => sidebarElement.value?.focus());
}

useProjectTreeNavigation({
  projects,
  tabs,
  filter,
  selection,
  sidebarElement,
  onAction(action) {
    if (action.type === "focus") choose(action.selection);
    else if (action.type === "activate") emit("activate", action.selection);
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
    <SidebarFooter v-if="collapsed" collapsed @toggle="emit('toggle')" @add="emit('addProject')" />
    <template v-else>
      <div class="filter-row">
        <span class="search-icon" aria-hidden="true"></span>
        <input
          v-model="filter"
          type="search"
          placeholder="Filter processes..."
          aria-label="Filter processes"
        />
        <button title="Manage projects" @click="emit('manage')">⋮</button>
      </div>

      <ProjectTree
        :projects="projects"
        :tabs="tabs"
        :filter="filter"
        :selection="selection"
        @manage="emit('manage', $event)"
        @close="emit('close', $event)"
        @toggle-project="emit('toggleProject', $event)"
        @toggle-terminals="emit('toggleTerminals', $event)"
        @toggle-commands="emit('toggleCommands', $event)"
        @focus="choose"
      />

      <SidebarFooter @toggle="emit('toggle')" @add="emit('addProject')" />
    </template>
  </aside>
</template>

<style scoped>
.sidebar {
  --bg: #12151d;
  --line: #252a38;
  --muted: #777a82;
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  color: #d5d6d9;
  background: linear-gradient(180deg, #12151d 0%, #0e1117 100%);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  user-select: none;
}
.sidebar.collapsed {
  width: 48px !important;
  align-items: stretch;
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
  height: 38px;
  flex: 0 0 38px;
  align-items: center;
  gap: 10px;
  padding: 0 13px 0 17px;
  border-bottom: 1px solid var(--line);
}
.search-icon {
  position: relative;
  width: 13px;
  height: 13px;
  border: 1.5px solid #90939a;
  border-radius: 50%;
}
.search-icon::after {
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 5px;
  height: 1.5px;
  background: #90939a;
  content: "";
  transform: rotate(45deg);
}
.filter-row input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: #bfc1c6;
  background: transparent;
  font-size: 12px;
}
.filter-row input::placeholder {
  color: #64676e;
}
.filter-row input::-webkit-search-cancel-button {
  display: none;
}
.filter-row > button {
  padding: 4px 7px;
  color: #62656c;
  font-size: 14px;
}
</style>
