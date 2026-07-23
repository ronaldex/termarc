<script setup lang="ts">
import { computed } from "vue";
import type { TerminalTabState } from "../types/terminal";
import { terminalDisplayModel } from "../utils/terminalLabels";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{ activeTab?: TerminalTabState }>();
const display = computed(() =>
  props.activeTab ? terminalDisplayModel(props.activeTab) : undefined,
);
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <span class="app-title">Termdeck</span>
    <div class="active-terminal" data-tauri-drag-region>
      <TerminalStatusIndicator
        :status="activeTab?.status ?? 'stopped'"
        :busy="display?.busy"
        :running="display?.running"
        variant="titlebar"
      />
      <strong>{{ display?.primaryLabel ?? "No terminal" }}</strong>
      <span>{{
        display?.secondaryLabel ?? activeTab?.detail ?? "Create a terminal to begin"
      }}</span>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  min-height: 42px;
  grid-column: 1 / -1;
  align-items: center;
  gap: 1.5rem;
  padding: 0 0.75rem 0 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-sidebar-bg);
  user-select: none;
}
.app-title {
  flex: 0 0 auto;
  margin-left: 72px;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 700;
}
.active-terminal {
  display: flex;
  overflow: hidden;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
}
.active-terminal strong,
.active-terminal span:last-child {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.active-terminal strong {
  flex: 0 1 auto;
  color: var(--color-text-strong);
}
.active-terminal span:last-child {
  flex: 1;
  color: var(--color-text-subtle);
  font-family:
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
</style>
