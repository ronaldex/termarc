<script setup lang="ts">
import { computed, ref } from "vue";
import { useScrollActiveItem } from "../composables/useScrollActiveItem";
import type { ProjectCommand, ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalMatchesFilter } from "../utils/terminalLabels";
import OverlayScrollArea from "./OverlayScrollArea.vue";
import ProjectBadge from "./ProjectBadge.vue";
import SidebarChevron from "./SidebarChevron.vue";
import TerminalTreeRow from "./TerminalTreeRow.vue";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{
  projects: ProjectTreeProject[];
  tabs: TerminalTabState[];
  filter: string;
  selection: SidebarSelection;
}>();
const projectList = ref<InstanceType<typeof OverlayScrollArea>>();
const activeItem = ref<HTMLElement>();
const filteredTabsByProject = computed(() => {
  const tabsByProject = new Map<string, TerminalTabState[]>();
  for (const tab of props.tabs) {
    if (tab.launch.kind === "command" || !terminalMatchesFilter(tab, props.filter)) continue;
    const tabs = tabsByProject.get(tab.projectId) ?? [];
    tabs.push(tab);
    tabsByProject.set(tab.projectId, tabs);
  }
  return tabsByProject;
});

const emit = defineEmits<{
  close: [id: string];
  rename: [id: string, name: string];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

function projectTabs(project: ProjectTreeProject): TerminalTabState[] {
  return filteredTabsByProject.value.get(project.id) ?? [];
}
function commandTab(projectId: string, commandId: string): TerminalTabState | undefined {
  return props.tabs.find(
    (tab) =>
      tab.projectId === projectId &&
      tab.launch.kind === "command" &&
      tab.launch.commandId === commandId,
  );
}
function commandIsActive(projectId: string, commandId: string): boolean {
  const status = commandTab(projectId, commandId)?.status;
  return status === "starting" || status === "running";
}
function commandPrimaryLabel(projectId: string, command: ProjectCommand): string {
  return commandIsActive(projectId, command.id) ? "Restart" : "Start";
}
function runOrRestartCommand(projectId: string, command: ProjectCommand): void {
  emit(
    commandIsActive(projectId, command.id) ? "reloadCommand" : "runCommand",
    projectId,
    command.id,
  );
}
function isTreeActive(id: string): boolean {
  return props.selection.id === id;
}
function setActiveItem(element: Element | null, id: string): void {
  if (id === props.selection.id && element instanceof HTMLElement) activeItem.value = element;
}
function focusActiveItem(): boolean {
  if (!(activeItem.value instanceof HTMLButtonElement)) return false;
  activeItem.value.focus();
  return document.activeElement === activeItem.value;
}

defineExpose({ focusActiveItem });

useScrollActiveItem(() => props.selection.id, activeItem, projectList);
</script>

<template>
  <OverlayScrollArea ref="projectList" class="project-list">
    <section
      v-for="project in projects"
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
          class="project-chevron"
          :open="project.projectOpen"
          title="Toggle project"
          @click="emit('toggleProject', project.id)"
        />
        <button
          class="project-toggle"
          @click="emit('focus', { id: project.id, kind: 'project', projectId: project.id })"
        >
          <ProjectBadge :name="project.name" />
          <strong>{{ project.name }}</strong>
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
              class="group-chevron"
              :open="project.terminalOpen"
              title="Toggle terminals"
              @click="emit('toggleTerminals', project.id)"
            />
            <button
              class="group-select"
              @click="
                emit('focus', {
                  id: `${project.id}:terminals`,
                  kind: 'terminals',
                  projectId: project.id,
                })
              "
            >
              <span class="group-icon terminal-icon">▣</span><span>TERMINALS</span><i></i
              ><small>{{ projectTabs(project).length }}</small>
            </button>
          </div>
          <template v-if="project.terminalOpen">
            <div
              v-for="tab in projectTabs(project)"
              :key="tab.id"
              :ref="(element) => setActiveItem(element, tab.id)"
            >
              <TerminalTreeRow
                :tab="tab"
                :active="isTreeActive(tab.id)"
                @focus="emit('focus', $event)"
                @rename="(id, name) => emit('rename', id, name)"
                @close="emit('close', $event)"
              />
            </div>
            <button
              :ref="(element) => setActiveItem(element, `${project.id}:add-terminal`)"
              class="add-row"
              :class="{ 'tree-active': isTreeActive(`${project.id}:add-terminal`) }"
              @click="
                emit('activate', {
                  id: `${project.id}:add-terminal`,
                  kind: 'add-terminal',
                  projectId: project.id,
                })
              "
            >
              <span class="add-terminal-icon">＋</span> Add terminal
            </button>
          </template>
        </div>

        <div v-if="project.commands?.length" class="group">
          <div
            :ref="(element) => setActiveItem(element, `${project.id}:commands`)"
            class="group-heading"
            :class="{ 'tree-active': isTreeActive(`${project.id}:commands`) }"
          >
            <SidebarChevron
              class="group-chevron"
              :open="project.commandsOpen"
              title="Toggle commands"
              @click="emit('toggleCommands', project.id)"
            />
            <button
              class="group-select"
              @click="
                emit('focus', {
                  id: `${project.id}:commands`,
                  kind: 'commands',
                  projectId: project.id,
                })
              "
            >
              <span class="group-icon">▱</span><span>COMMANDS</span><i></i
              ><small>{{ project.commands?.length ?? 0 }}</small>
            </button>
          </div>
          <template v-if="project.commandsOpen">
            <div
              v-for="command in project.commands ?? []"
              :key="`${project.id}:${command.id}`"
              :ref="(element) => setActiveItem(element, `${project.id}:command:${command.id}`)"
              class="command-row"
              :class="{ 'tree-active': isTreeActive(`${project.id}:command:${command.id}`) }"
            >
              <button
                class="command-select"
                @click="
                  emit('focus', {
                    id: `${project.id}:command:${command.id}`,
                    kind: 'command',
                    projectId: project.id,
                    commandId: command.id,
                  })
                "
              >
                <TerminalStatusIndicator
                  v-if="commandTab(project.id, command.id)"
                  :status="commandTab(project.id, command.id)!.status"
                  :running="commandTab(project.id, command.id)!.status === 'running'"
                />
                <span v-else class="command-icon">›_</span>
                <span class="command-labels">
                  <strong>{{ command.name }}</strong>
                  <small :title="command.command">{{ command.command }}</small>
                </span>
              </button>
              <span class="command-actions">
                <button
                  :title="`${commandPrimaryLabel(project.id, command)} command`"
                  :aria-label="`${commandPrimaryLabel(project.id, command)} command`"
                  @click="runOrRestartCommand(project.id, command)"
                >
                  <svg
                    v-if="commandIsActive(project.id, command.id)"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path class="stroke-icon" d="M13 5V2.5L11.2 4.3A5 5 0 1 0 13 8" />
                    <path class="stroke-icon" d="M10.5 2.5H13V5" />
                  </svg>
                  <svg v-else viewBox="0 0 16 16" aria-hidden="true">
                    <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
                  </svg>
                </button>
                <button
                  v-if="commandIsActive(project.id, command.id)"
                  class="stop-command"
                  title="Stop command"
                  aria-label="Stop command"
                  @click="emit('stopCommand', project.id, command.id)"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect class="fill-icon" x="4" y="4" width="8" height="8" rx="1" />
                  </svg>
                </button>
              </span>
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
.command-row,
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
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 0.75rem;
  place-items: center;
  line-height: 1;
}
.command-row {
  width: calc(100% - var(--tree-item-icon-left));
  min-height: 2.25rem;
}
.command-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding: 0;
  text-align: left;
}
.command-icon {
  width: 0.75rem;
  color: var(--color-text-subtle);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5rem;
}
.command-labels {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
}
.command-labels strong,
.command-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-labels strong {
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 400;
}
.command-labels small {
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 400;
}
.command-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.25rem;
}
.command-actions button {
  display: grid;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-3);
  font-size: 0.5625rem;
}
.command-actions button:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
.command-actions svg {
  width: 0.75rem;
  height: 0.75rem;
}
.command-actions .stroke-icon {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.command-actions .fill-icon {
  fill: currentColor;
}
.command-actions .stop-command {
  color: var(--color-status-error);
}
.command-row.tree-active::before,
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
.command-row:hover,
.add-row:hover {
  color: var(--color-text);
}
.add-row span {
  display: inline-grid;
  width: 0.75rem;
  place-items: center;
  font-size: 1rem;
  line-height: 1;
}
</style>
