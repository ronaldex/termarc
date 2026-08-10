<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

const props = defineProps<{
  x: number;
  y: number;
  hasCustomName: boolean;
}>();
const emit = defineEmits<{
  rename: [];
  reset: [];
  closeTerminal: [];
  dismiss: [];
}>();

const menu = ref<HTMLElement>();
const position = ref({ left: props.x, top: props.y });

async function positionMenu(): Promise<void> {
  await nextTick();
  const element = menu.value;
  if (!element) return;
  const margin = 8;
  position.value = {
    left: Math.max(margin, Math.min(props.x, window.innerWidth - element.offsetWidth - margin)),
    top: Math.max(margin, Math.min(props.y, window.innerHeight - element.offsetHeight - margin)),
  };
}

watch(() => [props.x, props.y], positionMenu, { flush: "post" });
onMounted(async () => {
  await positionMenu();
  menu.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="terminal-context-menu"
      role="menu"
      aria-label="Terminal actions"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @contextmenu.prevent.stop
    >
      <button type="button" role="menuitem" @click="emit('rename')">Change terminal name…</button>
      <button type="button" role="menuitem" :disabled="!hasCustomName" @click="emit('reset')">
        Use automatic title
      </button>
      <span class="separator" role="separator"></span>
      <button type="button" role="menuitem" class="danger" @click="emit('closeTerminal')">
        Close terminal
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.terminal-context-menu {
  position: fixed;
  z-index: 1000;
  display: flex;
  width: max-content;
  min-width: 12.5rem;
  flex-direction: column;
  padding: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--color-border-strong) 75%, transparent);
  border-radius: 0.75rem;
  box-shadow:
    0 1px 2px rgb(0 0 0 / 14%),
    0 0.75rem 1.875rem rgb(0 0 0 / 28%);
  background: color-mix(in srgb, var(--color-surface-active) 88%, transparent);
  backdrop-filter: blur(18px) saturate(160%);
  font: inherit;
  user-select: none;
}
button {
  height: 2rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 0.5rem;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}
button:hover:not(:disabled),
button:focus-visible:not(:disabled) {
  color: var(--color-text-strong);
  background: color-mix(in srgb, var(--color-surface-hover) 85%, transparent);
}
button.danger {
  color: var(--color-status-error);
}
button:disabled {
  color: var(--color-text-faint);
  cursor: default;
}
.separator {
  height: 1px;
  margin: 0.35rem 0.5rem;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}
</style>
