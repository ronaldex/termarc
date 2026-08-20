<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useScrollActiveItem } from "../../composables/useScrollActiveItem";
import { useProjectTreeSorting, type SortItem } from "../../composables/useProjectTreeSorting";
import type { SidebarContextMenuRequest } from "../../types/contextMenu";
import type { ProjectTreeProject } from "../../types/project";
import type { SidebarSelection } from "../../types/sidebar";
import type { TerminalTabState } from "../../types/terminal";
import { projectTreeModel } from "../../utils/projectTreeModel";
import { numberedSidebarShortcuts, sidebarShortcutKey } from "../../utils/sidebarShortcuts";
import type { DropPlacement } from "../../utils/terminalOrdering";
import ProcessTreeRow from "./ProcessTreeRow.vue";
import OverlayScrollArea from "../ui/OverlayScrollArea.vue";
import ProjectBadge from "./ProjectBadge.vue";
import SidebarTreeActionButton from "./SidebarTreeActionButton.vue";
import SidebarChevron from "./SidebarChevron.vue";
import TerminalTreeRow from "./TerminalTreeRow.vue";

const props = defineProps<{
  projects: ProjectTreeProject[];
  tabs: TerminalTabState[];
  shortcutModifier: "meta" | "ctrl";
  filter: string;
  selection: SidebarSelection;
  collapsed?: boolean;
}>();
const projectList = ref<InstanceType<typeof OverlayScrollArea>>();
const activeItem = ref<HTMLElement>();
const displayProjects = computed(() => projectTreeModel(props.projects, props.tabs, props.filter));
const shortcutNumbers = computed(
  () =>
    new Map(
      numberedSidebarShortcuts(props.projects, props.tabs).map(({ number, selection }) => [
        sidebarShortcutKey(selection),
        number,
      ]),
    ),
);
const sortingEnabled = computed(() => !props.collapsed && !props.filter);
const announcement = ref("");
const modifierPressed = ref(false);
const altPressed = ref(false);

function isConfiguredModifier(event: KeyboardEvent): boolean {
  return props.shortcutModifier === "ctrl" ? event.ctrlKey : event.metaKey;
}
function handleKeydown(event: KeyboardEvent): void {
  if (isConfiguredModifier(event)) modifierPressed.value = true;
  if (event.altKey) altPressed.value = true;
}
function handleKeyup(event: KeyboardEvent): void {
  modifierPressed.value = isConfiguredModifier(event);
  altPressed.value = event.altKey;
}
function handleWindowBlur(): void {
  modifierPressed.value = false;
  altPressed.value = false;
}

const emit = defineEmits<{
  startTerminal: [id: string];
  rename: [id: string];
  contextMenu: [request: SidebarContextMenuRequest];
  toggleProject: [id: string];
  startProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  toggleAgents: [id: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
  runAgent: [projectId: string, commandId: string];
  reloadAgent: [projectId: string, commandId: string];
  stopAgent: [projectId: string, commandId: string];
  reorderTerminal: [
    projectId: string,
    movedTabId: string,
    targetTabId: string,
    placement: DropPlacement,
  ];
  reorderCommand: [
    projectId: string,
    movedCommandId: string,
    targetCommandId: string,
    placement: DropPlacement,
  ];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
}>();

function isActive(tab: TerminalTabState | undefined): boolean {
  return tab?.status === "starting" || tab?.status === "running";
}
function isTreeActive(id: string): boolean {
  return props.selection.id === id;
}
function focusProject(projectId: string): void {
  emit("focus", { id: projectId, kind: "project", projectId });
  if (props.collapsed) emit("toggleProject", projectId);
}
function focusGroup(projectId: string, kind: "terminals" | "commands" | "agents"): void {
  emit("focus", { id: `${projectId}:${kind}`, kind, projectId });
  if (!props.collapsed) return;
  if (kind === "terminals") emit("toggleTerminals", projectId);
  else if (kind === "commands") emit("toggleCommands", projectId);
  else emit("toggleAgents", projectId);
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
          ".project-toggle, .group-select, .tree-item-select, .add-row",
        );
  button?.focus();
  return document.activeElement === button;
}
function emitDrop(source: SortItem, target: SortItem & { placement: DropPlacement }): void {
  if (source.kind === "terminal")
    emit("reorderTerminal", source.projectId, source.id, target.id, target.placement);
  else emit("reorderCommand", source.projectId, source.id, target.id, target.placement);
}
const { beginPointerDrag, dropClass } = useProjectTreeSorting({
  enabled: sortingEnabled,
  scrollViewport: () => projectList.value?.getViewport(),
  onDrop: emitDrop,
});

function moveWithKeyboard(event: KeyboardEvent, item: SortItem, label: string): void {
  if (!sortingEnabled.value || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key))
    return;
  const project = displayProjects.value.find((candidate) => candidate.id === item.projectId);
  const ids =
    item.kind === "terminal"
      ? project?.terminalTabs.map((tab) => tab.id)
      : item.kind === "agent"
        ? project?.agentItems.map(({ command }) => command.id)
        : project?.commandItems.map(({ command }) => command.id);
  if (!ids) return;
  const index = ids.indexOf(item.id);
  const direction = event.key === "ArrowUp" ? -1 : 1;
  const target = ids[index + direction];
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  emitDrop(item, { ...item, id: target, placement: direction < 0 ? "before" : "after" });
  announcement.value = `${label} moved ${direction < 0 ? "up" : "down"}, position ${index + direction + 1} of ${ids.length}`;
  requestAnimationFrame(focusActiveItem);
}

defineExpose({ focusActiveItem });

useScrollActiveItem(() => props.selection.id, activeItem, projectList);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);
  window.addEventListener("blur", handleWindowBlur);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("keyup", handleKeyup);
  window.removeEventListener("blur", handleWindowBlur);
});
</script>

<template>
  <OverlayScrollArea ref="projectList" class="project-list" :class="{ compact: collapsed }">
    <section
      v-for="(project, projectIndex) in displayProjects"
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
          <span v-if="altPressed && !collapsed && projectIndex < 9" class="project-shortcut">
            ⌥{{ projectIndex + 1 }}
          </span>
        </button>
        <span class="project-actions">
          <SidebarTreeActionButton
            title="Start autostart processes"
            @click.stop="emit('startProject', project.id)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
            </svg>
          </SidebarTreeActionButton>
        </span>
      </div>

      <div v-if="project.projectOpen" class="project-content">
        <div v-if="project.agentItems.length" class="group">
          <div
            :ref="(element) => setActiveItem(element, `${project.id}:agents`)"
            class="group-heading"
            :class="{ 'tree-active': isTreeActive(`${project.id}:agents`) }"
          >
            <SidebarChevron
              v-if="!collapsed"
              class="group-chevron"
              :open="project.agentsOpen"
              title="Toggle agents"
              @click="emit('toggleAgents', project.id)"
            />
            <button class="group-select" @click="focusGroup(project.id, 'agents')">
              <span class="group-icon">✦</span><span v-if="!collapsed">AGENTS</span><i></i>
              <small v-if="!collapsed">
                {{ project.agentItems.filter((item) => isActive(item.tab)).length }} /
                {{ project.agentItems.length }}
              </small>
            </button>
          </div>
          <template v-if="project.agentsOpen">
            <div
              v-for="item in project.agentItems"
              :key="`${project.id}:agent:${item.command.id}`"
              :ref="(element) => setActiveItem(element, `${project.id}:agent:${item.command.id}`)"
              class="sortable-row"
            >
              <ProcessTreeRow
                :project-id="project.id"
                category="agent"
                :command="item.command"
                :tab="item.tab"
                :shortcut-modifier="shortcutModifier"
                :modifier-pressed="modifierPressed"
                :shortcut-number="shortcutNumbers.get(`agent:${project.id}:${item.command.id}`)"
                :active="isTreeActive(`${project.id}:agent:${item.command.id}`)"
                :collapsed="collapsed"
                @focus="emit('focus', $event)"
                @activate="emit('activate', $event)"
                @context-menu="emit('contextMenu', $event)"
                @run="(projectId, commandId) => emit('runAgent', projectId, commandId)"
                @reload="(projectId, commandId) => emit('reloadAgent', projectId, commandId)"
                @stop="(projectId, commandId) => emit('stopAgent', projectId, commandId)"
              />
            </div>
          </template>
        </div>

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
              :title="
                collapsed
                  ? `Terminals (${project.terminalTabs.filter(isActive).length} / ${project.terminalTabs.length})`
                  : undefined
              "
              :aria-label="
                collapsed
                  ? `Terminals (${project.terminalTabs.filter(isActive).length} / ${project.terminalTabs.length})`
                  : undefined
              "
              @click="focusGroup(project.id, 'terminals')"
            >
              <span class="group-icon terminal-icon">▣</span>
              <span v-if="!collapsed">TERMINALS</span><i></i>
              <small v-if="!collapsed">
                {{ project.terminalTabs.filter(isActive).length }} /
                {{ project.terminalTabs.length }}
              </small>
            </button>
          </div>
          <template v-if="project.terminalOpen">
            <div
              v-for="tab in project.terminalTabs"
              :key="tab.id"
              :ref="(element) => setActiveItem(element, tab.id)"
              class="sortable-row"
              :class="dropClass({ kind: 'terminal', projectId: project.id, id: tab.id })"
              :data-sort-kind="sortingEnabled ? 'terminal' : undefined"
              :data-project-id="project.id"
              :data-sort-id="tab.id"
              @pointerdown="
                beginPointerDrag($event, { kind: 'terminal', projectId: project.id, id: tab.id })
              "
              @keydown="
                moveWithKeyboard(
                  $event,
                  { kind: 'terminal', projectId: project.id, id: tab.id },
                  tab.customTitle || tab.title,
                )
              "
            >
              <TerminalTreeRow
                :tab="tab"
                :shortcut-number="shortcutNumbers.get(`terminal:${tab.id}`)"
                :shortcut-modifier="shortcutModifier"
                :modifier-pressed="modifierPressed"
                :active="isTreeActive(tab.id)"
                :collapsed="collapsed"
                @focus="collapsed ? emit('activate', $event) : emit('focus', $event)"
                @rename="emit('rename', $event)"
                @context-menu="emit('contextMenu', $event)"
                @start="emit('startTerminal', $event)"
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
              :title="
                collapsed
                  ? `Commands (${project.commandItems.filter((item) => isActive(item.tab)).length} / ${project.commandItems.length})`
                  : undefined
              "
              :aria-label="
                collapsed
                  ? `Commands (${project.commandItems.filter((item) => isActive(item.tab)).length} / ${project.commandItems.length})`
                  : undefined
              "
              @click="focusGroup(project.id, 'commands')"
            >
              <span class="group-icon">▱</span>
              <span v-if="!collapsed">COMMANDS</span><i></i>
              <small v-if="!collapsed">
                {{ project.commandItems.filter((item) => isActive(item.tab)).length }} /
                {{ project.commandItems.length }}
              </small>
            </button>
          </div>
          <template v-if="project.commandsOpen">
            <div
              v-for="item in project.commandItems"
              :key="`${project.id}:${item.command.id}`"
              :ref="(element) => setActiveItem(element, `${project.id}:command:${item.command.id}`)"
              class="sortable-row"
              :class="dropClass({ kind: 'command', projectId: project.id, id: item.command.id })"
              :data-sort-kind="sortingEnabled ? 'command' : undefined"
              :data-project-id="project.id"
              :data-sort-id="item.command.id"
              @pointerdown="
                beginPointerDrag($event, {
                  kind: 'command',
                  projectId: project.id,
                  id: item.command.id,
                })
              "
              @keydown="
                moveWithKeyboard(
                  $event,
                  { kind: 'command', projectId: project.id, id: item.command.id },
                  item.command.name,
                )
              "
            >
              <ProcessTreeRow
                :project-id="project.id"
                :command="item.command"
                :tab="item.tab"
                :shortcut-modifier="shortcutModifier"
                :modifier-pressed="modifierPressed"
                :shortcut-number="shortcutNumbers.get(`command:${project.id}:${item.command.id}`)"
                :active="isTreeActive(`${project.id}:command:${item.command.id}`)"
                :collapsed="collapsed"
                @focus="emit('focus', $event)"
                @activate="emit('activate', $event)"
                @context-menu="emit('contextMenu', $event)"
                @run="(projectId, commandId) => emit('runCommand', projectId, commandId)"
                @reload="(projectId, commandId) => emit('reloadCommand', projectId, commandId)"
                @stop="(projectId, commandId) => emit('stopCommand', projectId, commandId)"
              />
            </div>
          </template>
        </div>
      </div>
    </section>
    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
  </OverlayScrollArea>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.sortable-row {
  position: relative;
}
.sortable-row[data-sort-kind] {
  cursor: grab;
}
.sortable-row[data-sort-kind]:active {
  cursor: grabbing;
}
.sortable-row.dragging {
  opacity: 0.55;
}
.sortable-row.drop-before::before,
.sortable-row.drop-after::after {
  position: absolute;
  right: 0;
  left: var(--tree-item-icon-left);
  z-index: 2;
  height: 0.125rem;
  border-radius: 0.125rem;
  background: var(--color-focus);
  content: "";
}
.sortable-row.drop-before::before {
  top: -0.0625rem;
}
.sortable-row.drop-after::after {
  bottom: -0.0625rem;
}
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
  display: grid;
  min-height: 3rem;
  grid-template-columns: var(--tree-toggle-column) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0.5rem var(--tree-inline-end) 0.5rem var(--tree-inline-start);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
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
.project-chevron,
.group-chevron {
  width: var(--tree-toggle-column);
  height: 1rem;
  transform: translateX(var(--tree-chevron-offset));
}
.project-chevron :deep(svg),
.group-chevron :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}
.project-actions {
  position: absolute;
  right: var(--tree-inline-end);
  display: flex;
  opacity: 0;
  transition: opacity 120ms ease;
}
.project-row:hover .project-actions,
.project-row:focus-within .project-actions {
  opacity: 1;
}
.project-toggle {
  display: grid;
  min-width: 0;
  grid-template-columns: var(--tree-icon-column) minmax(0, 1fr) var(--tree-action-column);
  align-items: center;
  column-gap: var(--tree-column-gap);
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
.project-shortcut {
  color: var(--color-text-faint);
  font-size: 0.625rem;
  text-align: right;
}
.project-content {
  padding: 0 var(--tree-inline-end) 0.75rem var(--tree-inline-start);
}
.group {
  margin: 0.0625rem 0 0.375rem;
}
.group-heading {
  position: relative;
  display: grid;
  width: calc(100% + var(--tree-inline-start) + var(--tree-inline-end));
  min-height: 2rem;
  box-sizing: border-box;
  grid-template-columns: var(--tree-toggle-column) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0.25rem var(--tree-inline-end) 0.25rem var(--tree-inline-start);
  margin-left: calc(-1 * var(--tree-inline-start));
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.group-heading.tree-active::before {
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0;
}
.group-select {
  display: grid;
  min-width: 0;
  grid-template-columns: var(--tree-icon-column) auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0;
  color: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-align: left;
}
.group-icon {
  width: var(--tree-icon-column);
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
  justify-self: end;
  color: var(--color-text-faint);
  font-size: 0.5625rem;
  font-weight: 400;
  letter-spacing: 0;
}
.add-row {
  position: relative;
  display: flex;
  width: calc(100% + var(--tree-inline-start) + var(--tree-inline-end));
  min-height: 1.75rem;
  box-sizing: border-box;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem var(--tree-inline-end) 0.25rem
    calc(var(--tree-inline-start) + var(--tree-item-icon-left));
  margin-left: calc(-1 * var(--tree-inline-start));
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
}
.add-terminal-icon {
  display: grid;
  width: var(--tree-item-icon-size);
  height: var(--tree-item-icon-size);
  flex: 0 0 var(--tree-item-icon-size);
  place-items: center;
  line-height: 1;
}
.add-row.tree-active::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0;
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
.project-list.compact .project-actions {
  display: none;
}
.project-list.compact .project-row {
  display: flex;
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .project-toggle,
.project-list.compact .group-select {
  display: flex;
  flex: 0 0 100%;
  justify-content: center;
}
.project-list.compact .group-select {
  box-sizing: border-box;
  gap: 0.25rem;
  padding: 0;
}
.project-list.compact .group-select i {
  display: none;
}
.project-list.compact .project-content {
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .group-heading {
  display: flex;
  width: 100%;
  justify-content: center;
  gap: 0;
  padding-right: 0;
  padding-left: 0;
  margin-left: 0;
}
.project-list.compact .add-row {
  box-sizing: border-box;
  width: 100%;
  justify-content: center;
  margin-left: 0;
  padding-right: 0;
  padding-left: 0;
}
.project-list.compact .group-heading.tree-active::before,
.project-list.compact .add-row.tree-active::before {
  left: 0;
}
</style>
