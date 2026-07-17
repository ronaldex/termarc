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
  padding: 11px 6px 8px 12px;
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
  scrollbar-color: #353b4b transparent;
  scrollbar-width: thin;
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-track),
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-corner) {
  background: var(--color-app-bg);
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}
.terminal-instance :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  border: 2px solid var(--color-app-bg);
  border-radius: 8px;
  background: #353b4b;
}
.empty-state {
  position: absolute;
  inset: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #687287;
  text-align: center;
}
.empty-state:not([hidden]) {
  display: flex;
}
.empty-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid #2d3446;
  border-radius: 13px;
  color: #8be9fd;
  background: #151a25;
  font-family:
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
.empty-state strong {
  color: #d1d7e3;
  font-size: 1rem;
}
.empty-state p {
  margin: 6px 0 16px;
  font-size: 0.6875rem;
}
</style>
