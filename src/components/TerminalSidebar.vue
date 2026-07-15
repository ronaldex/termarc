<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";

const props = defineProps<{
  tabs: TerminalTab[];
  activeTabId?: string;
  collapsed?: boolean;
  statusLabel: (tab: TerminalTab) => string;
  projects: Project[];
  activeProjectId: string;
  selection: SidebarSelection;
}>();
const emit = defineEmits<{
  manage: [];
  create: [cwd?: string];
  select: [id: string];
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
function projectTabs(project: Project): TerminalTab[] {
  const query = filter.value.trim().toLowerCase();
  return props.tabs.filter(
    (tab) => tab.projectId === project.id && (!query || tab.title.toLowerCase().includes(query)),
  );
}
const tree = computed<SidebarSelection[]>(() =>
  props.projects.flatMap((project) => {
    const nodes: SidebarSelection[] = [{ id: project.id, kind: "project", projectId: project.id }];
    if (!(project.terminalOpen || project.commandsOpen)) return nodes;
    nodes.push({ id: `${project.id}:terminals`, kind: "terminals", projectId: project.id });
    if (project.terminalOpen) {
      nodes.push(
        ...projectTabs(project).map((tab) => ({
          id: tab.id,
          kind: "terminal" as const,
          projectId: project.id,
          tabId: tab.id,
        })),
      );
      nodes.push({ id: `${project.id}:add-terminal`, kind: "add-terminal", projectId: project.id });
    }
    nodes.push({ id: `${project.id}:commands`, kind: "commands", projectId: project.id });
    if (project.commandsOpen)
      nodes.push({ id: `${project.id}:add-command`, kind: "add-command", projectId: project.id });
    return nodes;
  }),
);
function choose(node: SidebarSelection): void {
  emit("focus", node);
  requestAnimationFrame(() => sidebarElement.value?.focus());
}
function isTreeActive(id: string): boolean {
  return props.selection.id === id;
}
function onSidebarKeydown(event: KeyboardEvent): void {
  if (
    !event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const nodes = tree.value;
  if (!nodes.length) return;
  const index = Math.max(
    0,
    nodes.findIndex((node) => node.id === props.selection.id),
  );
  const current = nodes[index];
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    choose(nodes[(index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]);
    return;
  }
  const project = props.projects.find((item) => item.id === current.projectId);
  if (!project) return;
  if (event.key === "ArrowLeft") {
    if (current.kind === "terminal" && !sidebarElement.value?.contains(document.activeElement)) {
      choose(current);
      return;
    }
    if (current.kind === "project") {
      project.terminalOpen = false;
      project.commandsOpen = false;
    } else if (current.kind === "terminals" && project.terminalOpen)
      emit("toggleTerminals", project.id);
    else if (current.kind === "commands" && project.commandsOpen)
      emit("toggleCommands", project.id);
    else choose(nodes.find((node) => node.id === project.id) ?? current);
  } else if (current.kind === "project") {
    project.terminalOpen = true;
    project.commandsOpen = true;
  } else if (current.kind === "terminals" && !project.terminalOpen)
    emit("toggleTerminals", project.id);
  else if (current.kind === "commands" && !project.commandsOpen) emit("toggleCommands", project.id);
  else emit("activate", current);
}
onMounted(() => window.addEventListener("keydown", onSidebarKeydown, { capture: true }));
onBeforeUnmount(() => window.removeEventListener("keydown", onSidebarKeydown, { capture: true }));
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
  <aside
    ref="sidebarElement"
    class="sidebar"
    :class="{ collapsed }"
    tabindex="-1"
    aria-label="Project tree"
  >
    <div v-if="collapsed" class="collapsed-footer">
      <button title="Show sidebar" @click="emit('toggle')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
      </button>
    </div>
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

      <div class="project-list">
        <section v-for="project in props.projects" :key="project.id" class="project">
          <div
            class="project-row"
            :class="{
              active: project.id === activeProjectId,
              'tree-active': isTreeActive(project.id),
            }"
          >
            <button
              class="project-toggle"
              @click="choose({ id: project.id, kind: 'project', projectId: project.id })"
            >
              <span
                class="chevron"
                :class="{ open: project.terminalOpen || project.commandsOpen }"
                @click.stop="emit('toggleProject', project.id)"
                ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg
              ></span>
              <span class="project-badge">{{ initials(project.name) }}</span>
              <strong>{{ project.name }}</strong>
            </button>
            <button class="project-menu" title="Project settings" @click="emit('manage')">
              •••
            </button>
          </div>

          <div v-if="project.terminalOpen || project.commandsOpen" class="project-content">
            <div class="group">
              <button
                class="group-heading"
                :class="{ 'tree-active': isTreeActive(`${project.id}:terminals`) }"
                @click="
                  choose({
                    id: `${project.id}:terminals`,
                    kind: 'terminals',
                    projectId: project.id,
                  })
                "
              >
                <span
                  class="group-chevron"
                  :class="{ open: project.terminalOpen }"
                  @click.stop="emit('toggleTerminals', project.id)"
                  ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></span
                ><span class="group-icon terminal-icon">▣</span> <span>TERMINALS</span><i></i
                ><small>{{ projectTabs(project).length }}</small>
              </button>
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
                      choose({ id: tab.id, kind: 'terminal', projectId: project.id, tabId: tab.id })
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
                    choose({
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
              <button
                class="group-heading"
                :class="{ 'tree-active': isTreeActive(`${project.id}:commands`) }"
                @click="
                  choose({ id: `${project.id}:commands`, kind: 'commands', projectId: project.id })
                "
              >
                <span
                  class="group-chevron"
                  :class="{ open: project.commandsOpen }"
                  @click.stop="emit('toggleCommands', project.id)"
                  ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></span
                ><span class="group-icon">▱</span> <span>COMMANDS</span><i></i><small>0</small>
              </button>
              <button
                v-if="project.commandsOpen"
                class="add-row command-add"
                :class="{ 'tree-active': isTreeActive(`${project.id}:add-command`) }"
                @click="
                  choose({
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

      <div class="sidebar-footer">
        <button @click="emit('addProject')">＋ Add project</button>
        <button title="Hide sidebar" @click="emit('toggle')">
          <svg class="footer-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m10 3-5 5 5 5" />
          </svg>
        </button>
      </div>
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
.project-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.project {
  background: transparent;
}
.project-row {
  background: #191b1f;
  border-bottom: 1px solid #34363c;
}
.project-row {
  position: relative;
  display: flex;
  height: 47px;
  align-items: center;
  padding: 0 10px 0 13px;
}
.project-row.tree-active::before,
.group-heading.tree-active::before {
  position: absolute;
  left: -13px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: #6284ff;
  content: "";
}
.project-row.tree-active::before {
  top: 7px;
  bottom: 7px;
  left: 0;
}
.group-heading {
  position: relative;
}
.group-heading.tree-active::before {
  top: 4px;
  bottom: 4px;
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
.chevron,
.group-chevron {
  display: inline-grid;
  width: 10px;
  height: 16px;
  place-items: center;
  color: #696c73;
}
.chevron svg,
.group-chevron svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  transform: translateY(0) rotate(0deg);
  transition: transform 120ms ease;
}
.chevron.open svg,
.group-chevron.open svg {
  transform: rotate(90deg);
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
  text-align: left;
}
.group-icon {
  width: 12px;
  color: #858890;
  font-size: 11px;
  text-align: center;
}
.group-heading i {
  height: 1px;
  flex: 1;
  margin-left: 1px;
  background: #303236;
}
.group-heading small {
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
.process-row.selected::before,
.process-row.tree-active::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: -13px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: #6284ff;
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
.process-row.selected .process-title {
  color: #f0f0f2;
  font-weight: 550;
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
  background: #6284ff;
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
.sidebar-footer {
  display: flex;
  height: 38px;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 11px 0 17px;
  border-top: 1px solid var(--line);
}
.sidebar-footer button {
  color: #696c73;
  font-size: 11px;
}
.sidebar-footer button:hover {
  color: #c6c8cc;
}
.collapsed-footer {
  display: flex;
  height: 38px;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--line);
}
.collapsed-footer button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: #696c73;
}
.collapsed-footer button:hover {
  color: #c6c8cc;
}
.collapsed-footer svg,
.footer-chevron {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.footer-chevron {
  display: block;
}
</style>
