<script setup lang="ts">
import { computed, ref } from "vue";
import { useScrollActiveItem } from "../composables/useScrollActiveItem";
import type { ProjectCommand, ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalMatchesFilter } from "../utils/terminalLabels";
import OverlayScrollArea from "./OverlayScrollArea.vue";
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

function initials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

useScrollActiveItem(() => props.selection.id, activeItem, projectList);
</script>

<template>
  <OverlayScrollArea ref="projectList" class="project-list">
    <section
      v-for="project in projects"
      :key="project.id"
      class="project"
      :class="{
        collapsed: !project.terminalOpen && !(project.commands?.length && project.commandsOpen),
      }"
    >
      <div
        :ref="(element) => setActiveItem(element, project.id)"
        class="project-row"
        :class="{ 'tree-active': isTreeActive(project.id) }"
      >
        <SidebarChevron
          class="project-chevron"
          :open="project.terminalOpen || Boolean(project.commands?.length && project.commandsOpen)"
          title="Toggle project"
          @click="emit('toggleProject', project.id)"
        />
        <button
          class="project-toggle"
          @click="emit('focus', { id: project.id, kind: 'project', projectId: project.id })"
        >
          <span class="project-badge">{{ initials(project.name) }}</span>
          <strong>{{ project.name }}</strong>
        </button>
      </div>

      <div
        v-if="project.terminalOpen || (project.commands?.length && project.commandsOpen)"
        class="project-content"
      >
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
              <span>＋</span> Add terminal
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
  border-top: 1px solid #34363c;
}
.project.collapsed + .project .project-row {
  border-top: 0;
}
.project-row {
  position: relative;
  display: flex;
  height: 47px;
  align-items: center;
  padding: 0 10px 0 13px;
  border-bottom: 1px solid #34363c;
  background: #191b1f;
}
.project-row.tree-active::before,
.group-heading.tree-active::before {
  position: absolute;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-focus);
  content: "";
}
.project-row.tree-active::before {
  top: 7px;
  bottom: 7px;
  left: 0;
}
.project-chevron {
  width: 10px;
  height: 16px;
  margin-right: 8px;
}
.group-chevron {
  width: 10px;
  height: 16px;
}
.project-chevron :deep(svg),
.group-chevron :deep(svg) {
  width: 12px;
  height: 12px;
}
.project-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0;
  text-align: left;
}
.project-toggle strong {
  overflow: hidden;
  color: #dedfe2;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-badge {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 3px;
  color: #c6c8cd;
  background: #34373c;
  font-size: 8px;
  font-weight: 700;
}
.project-content {
  --tree-item-icon-left: 18px;
  padding: 0 11px 11px 13px;
}
.group {
  margin: 1px 0 5px;
}
.group-heading {
  position: relative;
  display: flex;
  width: 100%;
  height: 31px;
  align-items: center;
  gap: 7px;
  padding: 0 0 0 1px;
  color: #777a82;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.group-heading.tree-active::before {
  top: 4px;
  bottom: 4px;
  left: -13px;
}
.group-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 0;
  color: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-align: left;
}
.group-icon {
  width: 12px;
  color: #858890;
  font-size: 11px;
  text-align: center;
}
.group-select i {
  height: 1px;
  flex: 1;
  margin-left: 1px;
  background: #303236;
}
.group-select small {
  color: #62656c;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
}
.command-row,
.add-row {
  position: relative;
  display: flex;
  height: 28px;
  align-items: center;
  gap: 7px;
  margin-left: var(--tree-item-icon-left);
  padding: 0;
  color: #777a82;
  font-size: 11px;
}
.command-row {
  width: calc(100% - var(--tree-item-icon-left));
  height: 34px;
}
.command-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 0;
  text-align: left;
}
.command-icon {
  width: 12px;
  color: #858b99;
  font-family: "JetBrains Mono", monospace;
  font-size: 8px;
}
.command-labels {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.command-labels strong,
.command-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-labels strong {
  color: #c7c8cc;
  font-size: 12px;
  font-weight: 400;
}
.command-labels small {
  color: #696c73;
  font-size: 10px;
  font-weight: 400;
}
.command-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 3px;
}
.command-actions button {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  padding: 0;
  border: 1px solid #3a3e47;
  border-radius: 5px;
  color: #aeb3bd;
  background: #24272d;
  font-size: 9px;
}
.command-actions button:hover {
  border-color: #555b67;
  color: #e1e3e8;
  background: #2b2f36;
}
.command-actions svg {
  width: 12px;
  height: 12px;
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
  color: #d88b91;
}
.command-row.tree-active::before,
.add-row.tree-active::before {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: calc(-1 * var(--tree-item-icon-left) - 13px);
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-focus);
  content: "";
}
.command-row:hover,
.add-row:hover {
  color: #b9bbc0;
}
.add-row span {
  display: inline-grid;
  width: 12px;
  place-items: center;
  font-size: 13px;
  line-height: 1;
}
</style>
