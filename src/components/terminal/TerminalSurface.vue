<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppButton from "../ui/AppButton.vue";
import AppContextMenu, { type ContextMenuItem } from "../ui/ContextMenu.vue";
import type { TerminalTab } from "../../types/terminal";

const props = defineProps<{
  tabs: TerminalTab[];
  activeTabId?: string;
  isEmpty: boolean;
  setTerminalContainer: (tab: TerminalTab, element: Element | null) => void;
}>();
const emit = defineEmits<{
  create: [];
  host: [element: HTMLElement];
  copy: [tabId: string];
  paste: [tabId: string];
  close: [tabId: string];
}>();
const host = ref<HTMLElement>();
const contextMenu = ref<{ tabId: string; x: number; y: number }>();
const contextTab = computed(() => props.tabs.find((tab) => tab.id === contextMenu.value?.tabId));
const contextMenuItems = computed<ContextMenuItem[]>(() => [
  { id: "copy", label: "Copy", disabled: !contextTab.value?.terminal.hasSelection() },
  {
    id: "paste",
    label: "Paste",
    disabled: !contextTab.value?.session || contextTab.value.status !== "running",
  },
  { id: "close", label: "Close terminal", danger: true, separatorBefore: true },
]);

function openContextMenu(tabId: string, event: MouseEvent): void {
  event.preventDefault();
  contextMenu.value = { tabId, x: event.clientX, y: event.clientY };
}
function openContextMenuFromKeyboard(event: KeyboardEvent): void {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  const tabId = props.activeTabId;
  const element = event.currentTarget;
  if (!tabId || !(element instanceof HTMLElement)) return;
  event.preventDefault();
  const bounds = element.getBoundingClientRect();
  contextMenu.value = { tabId, x: bounds.left + 16, y: bounds.top + 16 };
}
function selectContextMenuItem(id: string): void {
  const tabId = contextMenu.value?.tabId;
  contextMenu.value = undefined;
  if (!tabId) return;
  if (id === "copy") emit("copy", tabId);
  else if (id === "paste") emit("paste", tabId);
  else if (id === "close") emit("close", tabId);
}
function dismissContextMenu(event?: PointerEvent): void {
  if (
    event?.target instanceof Node &&
    document.querySelector(".workspace-context-menu")?.contains(event.target)
  )
    return;
  contextMenu.value = undefined;
}

onMounted(() => {
  if (host.value) emit("host", host.value);
  document.addEventListener("pointerdown", dismissContextMenu, true);
  window.addEventListener("blur", dismissContextMenu);
  window.addEventListener("resize", dismissContextMenu);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", dismissContextMenu, true);
  window.removeEventListener("blur", dismissContextMenu);
  window.removeEventListener("resize", dismissContextMenu);
});
</script>

<template>
  <section class="terminal-shell" aria-label="Terminal">
    <div ref="host" id="terminal-host" :hidden="isEmpty">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="terminal-instance"
        :class="{ active: tab.id === activeTabId }"
        :ref="(element) => props.setTerminalContainer(tab, element)"
        @contextmenu="openContextMenu(tab.id, $event)"
        @keydown="openContextMenuFromKeyboard"
      />
    </div>
    <AppContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      label="Terminal actions"
      :items="contextMenuItems"
      @select="selectContextMenuItem"
      @dismiss="contextMenu = undefined"
    />
    <div class="empty-state" :hidden="!isEmpty">
      <span class="empty-state-icon">›_</span><strong>No open terminals</strong>
      <p>Start a local shell in a new tab.</p>
      <AppButton type="button" @click="emit('create')">New terminal</AppButton>
    </div>
  </section>
</template>

<style scoped>
.terminal-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0.375rem;
  background: var(--color-app-bg);
}
#terminal-host {
  position: relative;
  width: 100%;
  height: 100%;
}
.terminal-instance {
  position: absolute;
  inset: 0;
  display: none;
}
.terminal-instance.active {
  display: block;
}
.terminal-instance :deep(.xterm) {
  height: 100%;
}
.terminal-instance :deep(.xterm-viewport) {
  /* xterm's bundled stylesheet defaults the viewport to black. Keep it
     identical to the terminal surface so no black strip appears on resize. */
  background-color: var(--color-app-bg) !important;
  scrollbar-color: rgba(144, 147, 154, 0.32) transparent;
  scrollbar-width: thin;
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-track),
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-corner) {
  background: var(--color-app-bg);
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 0.375rem;
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  border: 0;
  border-right: 0.125rem solid transparent;
  border-radius: 0.125rem;
  background: rgba(144, 147, 154, 0.32);
  background-clip: padding-box;
}
.terminal-instance :deep(.xterm .xterm-scrollable-element > .scrollbar.vertical) {
  transform: translateX(0.375rem);
}
.terminal-instance :deep(.xterm .xterm-scrollable-element > .scrollbar.vertical > .slider) {
  left: 0 !important;
  width: 0.25rem !important;
  border-radius: 0.125rem;
  transition: background 120ms ease;
}
.terminal-instance :deep(.xterm .xterm-scrollable-element > .visible) {
  transition: opacity 200ms ease;
}
.terminal-instance :deep(.xterm .xterm-scrollable-element > .invisible.fade) {
  transition: opacity 200ms ease;
}
.empty-state {
  position: absolute;
  inset: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-subtle);
  text-align: center;
}
.empty-state:not([hidden]) {
  display: flex;
}
.empty-state-icon {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  margin-bottom: 1rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 0.875rem;
  color: var(--color-terminal-cyan);
  background: var(--color-surface-raised);
  font-family:
    "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
.empty-state strong {
  color: var(--color-text);
  font-size: 1rem;
}
.empty-state p {
  margin: 0.375rem 0 1rem;
  font-size: 0.6875rem;
}
</style>
