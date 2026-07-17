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
  grid-column: 1 / -1;
  align-items: center;
  gap: 22px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--color-border);
  color: #b8c0d2;
  background: var(--color-sidebar-bg);
  user-select: none;
}
.app-title {
  margin-left: 72px;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 700;
}
.active-terminal {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 0.6875rem;
}
.active-terminal span:last-child {
  overflow: hidden;
  color: #778196;
  font-family:
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
