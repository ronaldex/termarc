<script setup lang="ts">
import { onMounted, ref } from "vue";
import BaseButton from "./BaseButton.vue";
import type { TerminalTab } from "../types/terminal";

const props = defineProps<{
  tabs: TerminalTab[];
  activeTabId?: string;
  isEmpty: boolean;
  setTerminalContainer: (tab: TerminalTab, element: Element | null) => void;
}>();
const emit = defineEmits<{ create: []; host: [element: HTMLElement] }>();
const host = ref<HTMLElement>();

onMounted(() => {
  if (host.value) emit("host", host.value);
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
      />
    </div>
    <div class="empty-state" :hidden="!isEmpty">
      <span class="empty-state-icon">›_</span><strong>No open terminals</strong>
      <p>Start a local shell in a new tab.</p>
      <BaseButton type="button" @click="emit('create')">New terminal</BaseButton>
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
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
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
