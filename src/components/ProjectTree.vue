<script setup lang="ts">
import { computed, ref } from "vue";
import { useScrollActiveItem } from "../composables/useScrollActiveItem";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { projectTreeModel } from "../utils/projectTreeModel";
import CommandTreeRow from "./CommandTreeRow.vue";
import OverlayScrollArea from "./OverlayScrollArea.vue";
import ProjectBadge from "./ProjectBadge.vue";
import SidebarChevron from "./SidebarChevron.vue";
import TerminalTreeRow, { type TerminalContextMenuRequest } from "./TerminalTreeRow.vue";

const props = defineProps<{
  projects: ProjectTreeProject[];
  tabs: TerminalTabState[];
  filter: string;
  selection: SidebarSelection;
  collapsed?: boolean;
}>();
const projectList = ref<InstanceType<typeof OverlayScrollArea>>();
const activeItem = ref<HTMLElement>();
const displayProjects = computed(() => projectTreeModel(props.projects, props.tabs, props.filter));

const emit = defineEmits<{
  close: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

function isTreeActive(id: string): boolean {
  return props.selection.id === id;
}
function focusProject(projectId: string): void {
  emit("focus", { id: projectId, kind: "project", projectId });
  if (props.collapsed) emit("toggleProject", projectId);
}
function focusGroup(projectId: string, kind: "terminals" | "commands"): void {
  emit("focus", { id: `${projectId}:${kind}`, kind, projectId });
  if (!props.collapsed) return;
  if (kind === "terminals") emit("toggleTerminals", projectId);
  else emit("toggleCommands", projectId);
}
function setActiveItem(element: Element | null, id: string): void {
  if (id !== props.selection.id) return;
  activeItem.value = element instanceof HTMLElement ? element : undefined;
}
function focusActiveItem(): boolean {
  const activeElement = activeItem.value;
  const button =
    activeElement instanceof HTMLButtonElement
      ? activeElement
      : activeElement?.querySelector<HTMLButtonElement>(
          ".project-toggle, .group-select, .process-select, .command-select, .add-row",
        );
  button?.focus();
  return document.activeElement === button;
}

defineExpose({ focusActiveItem });

useScrollActiveItem(() => props.selection.id, activeItem, projectList);
</script>

<template>
  <OverlayScrollArea ref="projectList" class="project-list" :class="{ compact: collapsed }">
    <section
      v-for="project in displayProjects"
      :key="project.id"
      class="project"
      :class="{ collapsed: !project.projectOpen }"
    >
      <div
        :ref="(element) => setActiveItem(element, project.id)"
        class="project-row"
        :class="{ 'tree-active': isTreeActive(project.id) }"
      >
        <SidebarChevron
          v-if="!collapsed"
          class="project-chevron"
          :open="project.projectOpen"
          title="Toggle project"
          @click="emit('toggleProject', project.id)"
        />
        <button
          class="project-toggle"
          :title="collapsed ? project.name : undefined"
          :aria-label="collapsed ? project.name : undefined"
          @click="focusProject(project.id)"
        >
          <ProjectBadge :name="project.name" />
          <strong v-if="!collapsed">{{ project.name }}</strong>
        </button>
      </div>

      <div v-if="project.projectOpen" class="project-content">
        <div class="group">
          <div
            :ref="(element) => setActiveItem(element, `${project.id}:terminals`)"
            class="group-heading"
            :class="{ 'tree-active': isTreeActive(`${project.id}:terminals`) }"
          >
            <SidebarChevron
              v-if="!collapsed"
              class="group-chevron"
              :open="project.terminalOpen"
              title="Toggle terminals"
              @click="emit('toggleTerminals', project.id)"
            />
            <button
              class="group-select"
              :title="collapsed ? `Terminals (${project.terminalTabs.length})` : undefined"
              :aria-label="collapsed ? `Terminals (${project.terminalTabs.length})` : undefined"
              @click="focusGroup(project.id, 'terminals')"
            >
              <span class="group-icon terminal-icon">▣</span>
              <span v-if="!collapsed">TERMINALS</span><i></i>
              <small v-if="!collapsed">{{ project.terminalTabs.length }}</small>
            </button>
          </div>
          <template v-if="project.terminalOpen">
            <div
              v-for="tab in project.terminalTabs"
              :key="tab.id"
              :ref="(element) => setActiveItem(element, tab.id)"
            >
              <TerminalTreeRow
                :tab="tab"
                :active="isTreeActive(tab.id)"
                :collapsed="collapsed"
                @focus="collapsed ? emit('activate', $event) : emit('focus', $event)"
                @rename="emit('rename', $event)"
                @context-menu="emit('contextMenu', $event)"
                @close="emit('close', $event)"
              />
            </div>
            <button
              v-if="!project.hasTerminals"
              :ref="(element) => setActiveItem(element, `${project.id}:add-terminal`)"
              class="add-row"
              aria-label="Add terminal"
              :class="{ 'tree-active': isTreeActive(`${project.id}:add-terminal`) }"
              @click="
                emit('activate', {
                  id: `${project.id}:add-terminal`,
                  kind: 'add-terminal',
                  projectId: project.id,
                })
              "
            >
              <span class="add-terminal-icon" aria-hidden="true">
                <svg viewBox="0 0 12 12">
                  <path d="M6 2v8M2 6h8" />
                </svg>
              </span>
              <span v-if="!collapsed">Add terminal</span>
            </button>
          </template>
        </div>

        <div v-if="project.commandItems.length" class="group">
          <div
            :ref="(element) => setActiveItem(element, `${project.id}:commands`)"
            class="group-heading"
            :class="{ 'tree-active': isTreeActive(`${project.id}:commands`) }"
          >
            <SidebarChevron
              v-if="!collapsed"
              class="group-chevron"
              :open="project.commandsOpen"
              title="Toggle commands"
              @click="emit('toggleCommands', project.id)"
            />
            <button
              class="group-select"
              :title="collapsed ? `Commands (${project.commandItems.length})` : undefined"
              :aria-label="collapsed ? `Commands (${project.commandItems.length})` : undefined"
              @click="focusGroup(project.id, 'commands')"
            >
              <span class="group-icon">▱</span>
              <span v-if="!collapsed">COMMANDS</span><i></i>
              <small v-if="!collapsed">{{ project.commandItems.length }}</small>
            </button>
          </div>
          <template v-if="project.commandsOpen">
            <div
              v-for="item in project.commandItems"
              :key="`${project.id}:${item.command.id}`"
              :ref="(element) => setActiveItem(element, `${project.id}:command:${item.command.id}`)"
            >
              <CommandTreeRow
                :project-id="project.id"
                :command="item.command"
                :tab="item.tab"
                :active="isTreeActive(`${project.id}:command:${item.command.id}`)"
                :collapsed="collapsed"
                @focus="emit('focus', $event)"
                @activate="emit('activate', $event)"
                @run="(projectId, commandId) => emit('runCommand', projectId, commandId)"
                @reload="(projectId, commandId) => emit('reloadCommand', projectId, commandId)"
                @stop="(projectId, commandId) => emit('stopCommand', projectId, commandId)"
              />
            </div>
          </template>
        </div>
      </div>
    </section>
  </OverlayScrollArea>
</template>

<style scoped>
button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.project-list {
  min-height: 0;
  flex: 1;
}
.project {
  background: transparent;
}
.project + .project .project-row {
  border-top: 1px solid var(--color-border);
}
.project.collapsed + .project .project-row {
  border-top: 0;
}
.project-row {
  position: relative;
  display: flex;
  min-height: 3rem;
  align-items: center;
  padding: 0.5rem 0.625rem 0.5rem 0.875rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-1);
}
.project-row.tree-active::before,
.group-heading.tree-active::before {
  position: absolute;
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.project-row.tree-active::before {
  top: 0.5rem;
  bottom: 0.5rem;
  left: 0;
}
.project-chevron {
  width: 0.625rem;
  height: 1rem;
  margin-right: 0.5rem;
}
.group-chevron {
  width: 0.625rem;
  height: 1rem;
}
.project-chevron :deep(svg),
.group-chevron :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}
.project-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding: 0;
  text-align: left;
}
.project-toggle strong {
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-content {
  --tree-item-icon-left: 1.125rem;
  padding: 0 0.75rem 0.75rem 0.875rem;
}
.group {
  margin: 0.0625rem 0 0.375rem;
}
.group-heading {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 2rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0 0.25rem 0.0625rem;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.group-heading.tree-active::before {
  top: 0.25rem;
  bottom: 0.25rem;
  left: -0.875rem;
}
.group-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding: 0;
  color: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-align: left;
}
.group-icon {
  width: max(0.75rem, 1em);
  flex: 0 0 max(0.75rem, 1em);
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
  text-align: center;
}
.group-select i {
  height: 0.0625rem;
  flex: 1;
  margin-left: 0.0625rem;
  background: var(--color-border);
}
.group-select small {
  color: var(--color-text-faint);
  font-size: 0.5625rem;
  font-weight: 400;
  letter-spacing: 0;
}
.add-row {
  position: relative;
  display: flex;
  min-height: 1.75rem;
  align-items: center;
  gap: 0.5rem;
  margin-left: var(--tree-item-icon-left);
  padding: 0.25rem 0;
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
}
.add-terminal-icon {
  display: grid;
  width: var(--compact-tree-icon-width, 0.75rem);
  height: var(--compact-tree-icon-width, 0.75rem);
  flex: 0 0 var(--compact-tree-icon-width, 0.75rem);
  place-items: center;
  line-height: 1;
}
.add-row.tree-active::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: calc(-1 * var(--tree-item-icon-left) - 0.875rem);
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.add-row:hover {
  color: var(--color-text);
}
.add-row span {
  display: inline-grid;
  place-items: center;
  line-height: 1;
}
.add-terminal-icon svg {
  width: 0.75rem;
  height: 0.75rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.project-list.compact {
  --compact-tree-icon-width: 0.75rem;
  --compact-tree-inline-padding: 0.75rem;
  --compact-tree-suffix-gap: 0.125rem;
}
.project-list.compact .project-row {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .project-toggle,
.project-list.compact .group-select {
  flex: 0 0 100%;
}
.project-list.compact .project-toggle,
.project-list.compact .group-select {
  justify-content: center;
}
.project-list.compact .group-select {
  box-sizing: border-box;
  gap: 0.25rem;
  padding: 0 var(--compact-tree-inline-padding);
}
.project-list.compact .group-select i {
  min-width: 0;
  margin-left: 0;
}
.project-list.compact .project-content {
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .group-heading {
  justify-content: center;
  gap: 0;
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .add-row {
  box-sizing: border-box;
  width: 100%;
  justify-content: flex-start;
  margin-left: 0;
  padding-right: var(--compact-tree-inline-padding);
  padding-left: var(--compact-tree-inline-padding);
}
.project-list.compact .group-heading.tree-active::before,
.project-list.compact .add-row.tree-active::before {
  left: 0;
}
</style>
