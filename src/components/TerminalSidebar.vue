<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRefs, watch } from "vue";
import { useProjectTreeNavigation } from "../composables/useProjectTreeNavigation";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import type { DropPlacement } from "../utils/terminalOrdering";
import ProjectTree from "./ProjectTree.vue";
import SidebarFooter from "./SidebarFooter.vue";
import TerminalContextMenu from "./TerminalContextMenu.vue";
import TerminalRenameModal from "./TerminalRenameModal.vue";
import type { TerminalContextMenuRequest } from "./TerminalTreeRow.vue";

const props = defineProps<{
  tabs: TerminalTabState[];
  shortcutModifier: "meta" | "ctrl";
  collapsed?: boolean;
  projects: ProjectTreeProject[];
  selection: SidebarSelection;
  isTerminalFocused: () => boolean;
}>();
const emit = defineEmits<{
  manage: [projectId?: string];
  openSettings: [];
  openKeyboardShortcuts: [];
  close: [id: string];
  setTerminalTitleOverride: [id: string, title: string];
  renameModalChange: [open: boolean];
  preview: [];
  toggle: [];
  addProject: [];
  toggleProject: [id: string];
  toggleTerminals: [id: string];
  toggleCommands: [id: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
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

const filter = ref("");
const sidebarElement = ref<HTMLElement>();
const projectTree = ref<InstanceType<typeof ProjectTree>>();
const searchInput = ref<HTMLInputElement>();
const { projects, tabs, selection, collapsed } = toRefs(props);
const treeFilter = computed(() => (collapsed.value ? "" : filter.value));
const contextMenu = ref<TerminalContextMenuRequest>();
const sidebarMenuOpen = ref(false);
const renameTabId = ref<string>();
const renameTrigger = ref<HTMLButtonElement>();
const overlayActive = computed(() => Boolean(contextMenu.value || renameTabId.value));
const contextMenuTab = computed(() =>
  contextMenu.value ? props.tabs.find((tab) => tab.id === contextMenu.value?.tabId) : undefined,
);
const renameTab = computed(() =>
  renameTabId.value ? props.tabs.find((tab) => tab.id === renameTabId.value) : undefined,
);

function focusTree(): void {
  const focused = projectTree.value?.focusActiveItem();
  if (!focused) sidebarElement.value?.focus();
}

async function focusSearch(): Promise<void> {
  if (props.collapsed) emit("preview");
  await nextTick();
  searchInput.value?.focus();
}

function hasTreeFocus(): boolean {
  return sidebarElement.value?.contains(document.activeElement) ?? false;
}

function closeTerminal(id: string): void {
  dismissContextMenu();
  emit("close", id);
  requestAnimationFrame(focusTree);
}

function dismissContextMenu(): void {
  contextMenu.value = undefined;
}

function toggleSidebarMenu(event: MouseEvent): void {
  event.stopPropagation();
  sidebarMenuOpen.value = !sidebarMenuOpen.value;
}

function openSidebarSettings(): void {
  sidebarMenuOpen.value = false;
  emit("openSettings");
}

function manageProjects(): void {
  sidebarMenuOpen.value = false;
  emit("manage");
}

function openKeyboardShortcuts(): void {
  sidebarMenuOpen.value = false;
  emit("openKeyboardShortcuts");
}

async function openContextMenu(request: TerminalContextMenuRequest): Promise<void> {
  emit("focus", {
    id: request.tabId,
    kind: "terminal",
    projectId: props.tabs.find((tab) => tab.id === request.tabId)?.projectId ?? "",
    tabId: request.tabId,
  });
  await nextTick();
  contextMenu.value = request;
}

function openRename(id: string): void {
  renameTrigger.value = contextMenu.value?.trigger;
  dismissContextMenu();
  renameTabId.value = id;
  emit("renameModalChange", true);
}

function closeRename(): void {
  const trigger = renameTrigger.value;
  renameTrigger.value = undefined;
  renameTabId.value = undefined;
  emit("renameModalChange", false);
  void nextTick(() => {
    if (trigger) trigger.focus();
    else focusTree();
  });
}

function saveRename(title: string): void {
  const id = renameTabId.value;
  closeRename();
  if (id) emit("setTerminalTitleOverride", id, title);
}

function resetTitle(): void {
  const id = contextMenu.value?.tabId;
  dismissContextMenu();
  if (id) emit("setTerminalTitleOverride", id, "");
}

function choose(node: SidebarSelection): void {
  const terminalWasFocused = props.isTerminalFocused();
  emit("focus", node);
  if (props.collapsed) {
    emit("preview");
    requestAnimationFrame(focusTree);
    return;
  }
  if (terminalWasFocused && node.kind === "terminal" && node.tabId) {
    emit("activate", node);
    return;
  }
  requestAnimationFrame(focusTree);
}

function activate(node: SidebarSelection): void {
  if (props.collapsed) {
    choose(node);
    return;
  }
  emit("activate", node);
}

function preview(): void {
  if (props.collapsed) emit("preview");
}

defineExpose({ focusTree, hasTreeFocus });

useProjectTreeNavigation({
  projects,
  tabs,
  filter: treeFilter,
  selection,
  sidebarElement,
  shortcutScopeActive: overlayActive,
  onAction(action) {
    if (action.type === "focus") choose(action.selection);
    else if (action.type === "activate") emit("activate", action.selection);
    else if (action.type === "toggle-project") emit("toggleProject", action.projectId);
    else if (action.type === "toggle-terminals") emit("toggleTerminals", action.projectId);
    else emit("toggleCommands", action.projectId);
  },
});

function dismissMenuOnKeydown(event: KeyboardEvent): void {
  if (!contextMenu.value) return;
  if (["Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    dismissContextMenu();
  }
}
function dismissMenuOnPointerDown(event: PointerEvent): void {
  if (
    !(event.target instanceof Node) ||
    !document.querySelector(".terminal-context-menu")?.contains(event.target)
  ) {
    dismissContextMenu();
  }
  if (!(event.target instanceof Node) || !sidebarElement.value?.contains(event.target)) {
    sidebarMenuOpen.value = false;
  }
}
watch(() => props.selection.id, dismissContextMenu);
watch(
  () => props.collapsed,
  () => {
    sidebarMenuOpen.value = false;
  },
);
watch(() => props.collapsed, dismissContextMenu);
onMounted(() => {
  document.addEventListener("pointerdown", dismissMenuOnPointerDown, true);
  window.addEventListener("keydown", dismissMenuOnKeydown, { capture: true });
  window.addEventListener("blur", dismissContextMenu);
  window.addEventListener("resize", dismissContextMenu);
  document.addEventListener("scroll", dismissContextMenu, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", dismissMenuOnPointerDown, true);
  window.removeEventListener("keydown", dismissMenuOnKeydown, { capture: true });
  window.removeEventListener("blur", dismissContextMenu);
  window.removeEventListener("resize", dismissContextMenu);
  document.removeEventListener("scroll", dismissContextMenu, true);
  emit("renameModalChange", false);
});
</script>

<template>
  <aside
    ref="sidebarElement"
    class="sidebar"
    :class="{ collapsed }"
    tabindex="-1"
    aria-label="Project tree"
    @click="preview"
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
      <button
        v-if="!collapsed"
        class="sidebar-menu-button"
        type="button"
        title="Sidebar menu"
        aria-label="Sidebar menu"
        :aria-expanded="sidebarMenuOpen"
        @click="toggleSidebarMenu"
      >
        ⋮
      </button>
      <div v-if="sidebarMenuOpen" class="sidebar-menu" role="menu" @click.stop>
        <button type="button" role="menuitem" @click="openSidebarSettings">App settings</button>
        <button type="button" role="menuitem" @click="manageProjects">Manage projects</button>
        <button type="button" role="menuitem" @click="openKeyboardShortcuts">
          Keyboard shortcuts
        </button>
      </div>
    </div>

    <ProjectTree
      ref="projectTree"
      :projects="projects"
      :tabs="tabs"
      :shortcut-modifier="shortcutModifier"
      :filter="treeFilter"
      :selection="selection"
      :collapsed="collapsed"
      @close="closeTerminal"
      @rename="openRename"
      @context-menu="openContextMenu"
      @toggle-project="emit('toggleProject', $event)"
      @toggle-terminals="emit('toggleTerminals', $event)"
      @toggle-commands="emit('toggleCommands', $event)"
      @run-command="(projectId, commandId) => emit('runCommand', projectId, commandId)"
      @reload-command="(projectId, commandId) => emit('reloadCommand', projectId, commandId)"
      @stop-command="(projectId, commandId) => emit('stopCommand', projectId, commandId)"
      @reorder-terminal="
        (projectId, movedId, targetId, placement) =>
          emit('reorderTerminal', projectId, movedId, targetId, placement)
      "
      @reorder-command="
        (projectId, movedId, targetId, placement) =>
          emit('reorderCommand', projectId, movedId, targetId, placement)
      "
      @focus="choose"
      @activate="activate"
    />

    <SidebarFooter :collapsed="collapsed" @toggle="emit('toggle')" @add="emit('addProject')" />

    <TerminalContextMenu
      v-if="contextMenu && contextMenuTab"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :has-custom-name="Boolean(contextMenuTab.customTitle)"
      @rename="openRename(contextMenu.tabId)"
      @reset="resetTitle"
      @close-terminal="closeTerminal(contextMenu.tabId)"
      @dismiss="dismissContextMenu"
    />
    <TerminalRenameModal
      v-if="renameTab"
      :initial-name="renameTab.customTitle"
      @save="saveRename"
      @cancel="closeRename"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  --bg: var(--color-sidebar-bg);
  --line: var(--color-border);
  --muted: var(--color-text-subtle);
  --tree-toggle-column: 0.625rem;
  --tree-icon-column: 1.25rem;
  --tree-item-icon-size: var(--tree-icon-column);
  --tree-column-gap: 0.5rem;
  --tree-action-column: 1.5rem;
  --tree-inline-start: 0.875rem;
  --tree-inline-end: 0.75rem;
  --tree-chevron-offset: -0.125rem;
  --tree-item-icon-left: calc(var(--tree-toggle-column) + var(--tree-column-gap));
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
  --tree-item-icon-size: 0.75rem;
  align-items: stretch;
  border-right: 1px solid var(--color-border-muted);
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
  position: relative;
  display: flex;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  gap: var(--tree-column-gap);
  padding: 0 var(--tree-inline-end) 0 var(--tree-inline-start);
  border-bottom: 1px solid var(--line);
}
.search-button {
  display: grid;
  width: var(--tree-toggle-column);
  height: 1.75rem;
  flex: 0 0 var(--tree-toggle-column);
  padding: 0;
  place-items: center;
  transform: translateX(var(--tree-chevron-offset));
}
.filter-row.compact {
  justify-content: center;
  gap: 0;
  padding: 0;
}
.filter-row.compact .search-button {
  transform: none;
}
.search-icon {
  position: relative;
  width: var(--tree-toggle-column);
  height: var(--tree-toggle-column);
  flex: 0 0 var(--tree-toggle-column);
  border: 1.25px solid var(--color-text-muted);
  border-radius: 50%;
}
.search-icon::after {
  position: absolute;
  right: -0.1875rem;
  bottom: -0.1rem;
  width: 0.3125rem;
  height: 0.08rem;
  background: var(--color-text-muted);
  content: "";
  transform: rotate(45deg);
}
.filter-row input {
  min-width: 0;
  flex: 1;
  border: 0;
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
.sidebar-menu-button {
  position: absolute;
  right: 0.25rem;
  width: 1.5rem;
  height: 1.75rem;
  padding: 0;
  color: var(--color-text-faint);
  font-size: 1rem;
  line-height: 1;
  text-align: right;
}
.sidebar-menu-button:hover {
  color: var(--color-text);
}
.sidebar-menu {
  position: absolute;
  top: 2.25rem;
  right: var(--tree-inline-end);
  z-index: 40;
  display: flex;
  min-width: 10rem;
  flex-direction: column;
  padding: 0.25rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.5rem;
  background: var(--color-surface-raised);
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 25%);
}
.sidebar-menu button {
  padding: 0.45rem 0.625rem;
  border-radius: 0.3rem;
  color: var(--color-text);
  text-align: left;
  font-size: 0.75rem;
}
.sidebar-menu button:hover {
  background: var(--color-surface-emphasis);
}

.search-button:hover .search-icon {
  border-color: var(--color-text);
}
.search-button:hover .search-icon::after {
  background: var(--color-text);
}
</style>
