<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppButton from "../ui/AppButton.vue";
import AppContextMenu, { type ContextMenuItem } from "../ui/ContextMenu.vue";
import type { TerminalTab } from "../../types/terminal";

const props = defineProps<{
  tabs: TerminalTab[];
  mainTerminalId?: string;
  isEmpty: boolean;
  terminalContainerRef: (tab: TerminalTab, ownerId: string) => (element: Element | null) => void;
}>();
const emit = defineEmits<{
  create: [];
  host: [element: HTMLElement];
  focus: [tabId: string];
  copy: [tabId: string];
  paste: [tabId: string];
  close: [tabId: string];
}>();
const host = ref<HTMLElement>();
const contextMenu = ref<{ x: number; y: number }>();
const mainTab = computed(() => props.tabs.find((tab) => tab.id === props.mainTerminalId));
const contextMenuItems = computed<ContextMenuItem[]>(() => [
  { id: "copy", label: "Copy", disabled: !mainTab.value?.terminal.hasSelection() },
  {
    id: "paste",
    label: "Paste",
    disabled: !mainTab.value?.session || mainTab.value.status !== "running",
  },
  { id: "close", label: "Close terminal", danger: true, separatorBefore: true },
]);

function openContextMenu(event: MouseEvent): void {
  event.preventDefault();
  if (mainTab.value) emit("focus", mainTab.value.id);
  contextMenu.value = { x: event.clientX, y: event.clientY };
}
function selectContextMenuItem(id: string): void {
  const tabId = mainTab.value?.id;
  contextMenu.value = undefined;
  if (!tabId) return;
  if (id === "copy") emit("copy", tabId);
  else if (id === "paste") emit("paste", tabId);
  else if (id === "close") emit("close", tabId);
}

onMounted(() => {
  if (host.value) emit("host", host.value);
});
</script>

<template>
  <section class="terminal-shell" aria-label="Terminal">
    <div ref="host" class="terminal-host" :hidden="isEmpty || !mainTab">
      <div
        v-if="mainTab"
        :key="mainTab.id"
        class="terminal-instance"
        :ref="props.terminalContainerRef(mainTab, 'workspace')"
        @pointerdown="emit('focus', mainTab.id)"
        @contextmenu="openContextMenu"
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
.terminal-host,
.terminal-instance,
.terminal-instance :deep(.terminal-runtime-root),
.terminal-instance :deep(.xterm) {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.terminal-instance {
  overflow: hidden;
}
.terminal-instance :deep(.xterm-viewport) {
  background-color: var(--color-app-bg) !important;
  scrollbar-color: rgba(144, 147, 154, 0.32) transparent;
  scrollbar-width: thin;
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
  font-family: "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
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
