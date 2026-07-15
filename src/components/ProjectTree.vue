<script setup lang="ts">
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import SidebarChevron from "./SidebarChevron.vue";

const props = defineProps<{
  projects: ProjectTreeProject[];
  tabs: TerminalTab[];
  filter: string;
  selection: SidebarSelection;
}>();
const emit = defineEmits<{
  manage: [projectId: string];
  close: [id: string];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  focus: [selection: SidebarSelection];
}>();

function projectTabs(project: ProjectTreeProject): TerminalTab[] {
  const query = props.filter.trim().toLowerCase();
  return props.tabs.filter(
    (tab) => tab.projectId === project.id && (!query || tab.title.toLowerCase().includes(query)),
  );
}
function isTreeActive(id: string): boolean {
  return props.selection.id === id;
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
</script>

<template>
  <div class="project-list">
    <section v-for="project in projects" :key="project.id" class="project">
      <div class="project-row" :class="{ 'tree-active': isTreeActive(project.id) }">
        <SidebarChevron
          class="project-chevron"
          :open="project.terminalOpen || project.commandsOpen"
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
        <button class="project-menu" title="Project settings" @click="emit('manage', project.id)">
          •••
        </button>
      </div>

      <div v-if="project.terminalOpen || project.commandsOpen" class="project-content">
        <div class="group">
          <div
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
              class="process-row"
              :class="{ 'tree-active': isTreeActive(tab.id) }"
            >
              <button
                class="process-select"
                @click="
                  emit('focus', {
                    id: tab.id,
                    kind: 'terminal',
                    projectId: project.id,
                    tabId: tab.id,
                  })
                "
              >
                <span class="status-dot" :class="tab.status"></span
                ><span class="process-title">{{ tab.title }}</span>
              </button>
              <span class="shortcut">⌘{{ tab.number }}</span
              ><button class="close" title="Close terminal" @click="emit('close', tab.id)">
                ×
              </button>
            </div>
            <button
              class="add-row"
              :class="{ 'tree-active': isTreeActive(`${project.id}:add-terminal`) }"
              @click="
                emit('focus', {
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

        <div class="group">
          <div
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
              <span class="group-icon">▱</span><span>COMMANDS</span><i></i><small>0</small>
            </button>
          </div>
          <button
            v-if="project.commandsOpen"
            class="add-row command-add"
            :class="{ 'tree-active': isTreeActive(`${project.id}:add-command`) }"
            @click="
              emit('focus', {
                id: `${project.id}:add-command`,
                kind: 'add-command',
                projectId: project.id,
              })
            "
          >
            <span>＋</span> Add command
          </button>
        </div>
      </div>
    </section>
  </div>
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
  overflow: auto;
}
.project {
  background: transparent;
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
.project-menu {
  padding: 5px;
  color: #61646b;
  opacity: 0;
}
.project-row:hover .project-menu {
  opacity: 1;
}
.project-content {
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
.process-row {
  position: relative;
  display: flex;
  height: 32px;
  align-items: center;
  padding-left: 27px;
  border-radius: 3px;
}
.process-row.tree-active::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: -13px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-focus);
  content: "";
}
.process-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 0;
  text-align: left;
}
.status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #666970;
}
.status-dot.running {
  background: #8f939b;
}
.status-dot.starting {
  background: #d5a85c;
}
.status-dot.error {
  background: #d76770;
}
.process-title {
  overflow: hidden;
  color: #c7c8cc;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shortcut {
  color: #575a61;
  font-size: 10px;
}
.close {
  width: 20px;
  color: #6e7178;
  font-size: 15px;
  opacity: 0;
}
.process-row:hover .close {
  opacity: 1;
}
.process-row:hover .shortcut {
  display: none;
}
.add-row {
  position: relative;
  display: flex;
  height: 28px;
  align-items: center;
  gap: 10px;
  margin-left: 23px;
  padding: 0;
  color: #666970;
  font-size: 11px;
}
.add-row.tree-active::before {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: -36px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-focus);
  content: "";
}
.add-row:hover {
  color: #b9bbc0;
}
.add-row span {
  display: inline-grid;
  width: 6px;
  place-items: center;
  font-size: 13px;
  line-height: 1;
}
</style>
