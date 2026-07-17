<script setup lang="ts">
import type { TerminalStatus } from "../types/terminal";

withDefaults(
  defineProps<{
    status: TerminalStatus;
    busy?: boolean;
    running?: boolean;
    title?: string;
    variant?: "tree" | "titlebar";
  }>(),
  {
    busy: false,
    running: false,
    title: undefined,
    variant: "tree",
  },
);
</script>

<template>
  <span class="terminal-status" :class="`variant-${variant}`" :title="title" aria-hidden="true">
    <span
      class="terminal-status-dot"
      :class="[status, { busy, active: status === 'running' && (running || busy) }]"
    />
  </span>
</template>

<style scoped>
.terminal-status {
  display: grid;
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  place-items: center;
}
.terminal-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #666970;
}
.terminal-status.variant-titlebar {
  width: 7px;
  height: 7px;
  flex-basis: 7px;
}
.variant-titlebar .terminal-status-dot {
  width: 7px;
  height: 7px;
  background: #687087;
}
.terminal-status-dot.active {
  background: var(--color-status-running);
}
.terminal-status-dot.active.busy {
  background: conic-gradient(var(--color-status-running) 0deg 300deg, transparent 300deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1px), #000 0);
  mask: radial-gradient(farthest-side, transparent calc(100% - 1px), #000 0);
  animation: terminal-status-spin 1.5s linear infinite;
}
.terminal-status-dot.error {
  background: #d76770;
}
.variant-titlebar .terminal-status-dot.error {
  background: var(--color-status-error);
}
@keyframes terminal-status-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
