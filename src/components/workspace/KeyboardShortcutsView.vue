<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useAppSettings } from "../../composables/useAppSettings";

const { settings } = useAppSettings();
const emit = defineEmits<{ close: [] }>();
const modal = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const modifier = computed(() => (settings.shortcutModifier === "meta" ? "⌘" : "Ctrl"));
const shortcuts = [
  ["Open settings", ","],
  ["Create terminal", "T"],
  ["Create subterminal", "Shift T"],
  ["Close terminal", "W"],
  ["Toggle left sidebar", "S"],
  ["Toggle right sidebar", "D"],
  ["Focus process filter", "Shift F"],
  ["Open and close sidebar panels", "← / →"],
  ["Cycle main agents and terminals", "↑ / ↓"],
  ["Cycle active terminal or agent and its children", "Shift ↑ / ↓"],
  ["Switch to terminal 1–9", "1–9"],
  ["Increase/decrease terminal font", "+ / −"],
];
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    modal.value?.scrollBy({ top: event.key === "ArrowDown" ? 48 : -48 });
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = Array.from(
    modal.value?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => void nextTick(() => closeButton.value?.focus()));
</script>

<template>
  <div class="shortcuts-backdrop" @mousedown.self="emit('close')">
    <section
      ref="modal"
      class="shortcuts-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header>
        <span id="shortcuts-title">Keyboard shortcuts</span
        ><button ref="closeButton" type="button" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>
      <h2>Shortcuts</h2>
      <div class="shortcut-list">
        <div v-for="[label, key] in shortcuts" :key="label" class="shortcut-row">
          <span>{{ label }}</span
          ><kbd>{{ modifier }} {{ key }}</kbd>
        </div>
        <div class="shortcut-row">
          <span>Show keyboard shortcuts</span><kbd>{{ modifier }} /</kbd>
        </div>
        <div class="shortcut-row"><span>Focus project 1–9</span><kbd>Alt 1–9</kbd></div>
        <div class="shortcut-row"><span>Dismiss / cancel</span><kbd>Esc</kbd></div>
      </div>
      <h2>Panel navigation</h2>
      <div class="shortcut-list">
        <div class="shortcut-row">
          <span>Workspace → left sidebar</span><kbd>{{ modifier }} ←</kbd>
        </div>
        <div class="shortcut-row">
          <span>Left sidebar → workspace</span><kbd>{{ modifier }} →</kbd>
        </div>
        <div class="shortcut-row">
          <span>Workspace → right sidebar</span><kbd>{{ modifier }} →</kbd>
        </div>
        <div class="shortcut-row">
          <span>Cycle right sidebar views</span><kbd>{{ modifier }} →</kbd>
        </div>
        <div class="shortcut-row">
          <span>Right sidebar → workspace</span><kbd>{{ modifier }} ←</kbd>
        </div>
        <div class="shortcut-row"><span>Navigate focused sidebar</span><kbd>Arrow keys</kbd></div>
        <div class="shortcut-row"><span>Activate focused item</span><kbd>Enter</kbd></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shortcuts-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: grid;
  padding: 1rem;
  background: rgb(0 0 0 / 45%);
  place-items: center;
}
.shortcuts-page {
  width: min(100%, 42rem);
  max-height: calc(100% - 2rem);
  overflow: auto;
  padding: 1.25rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.625rem;
  box-shadow: 0 1.25rem 3.5rem rgb(0 0 0 / 40%);
  color: var(--color-text);
  background: var(--color-surface-raised);
  font: inherit;
}
.shortcuts-page header {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}
.shortcuts-page header span {
  color: var(--color-text-strong);
  font-size: 0.875rem;
  font-weight: 700;
}
.shortcuts-page header button {
  position: absolute;
  top: -0.5rem;
  right: -0.5rem;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 0.375rem;
  color: var(--color-text-subtle);
  background: transparent;
  font: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}
.shortcuts-page header button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
header small {
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
}
h2 {
  margin: 1rem 0 0.5rem;
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.shortcut-list {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.75rem;
}
.shortcut-row:last-child {
  border-bottom: 0;
}
kbd {
  min-width: 3rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
  color: var(--color-text-strong);
  background: var(--color-surface-emphasis);
  text-align: center;
  font-family: inherit;
  font-size: 0.6875rem;
}
.shortcut-row kbd {
  white-space: nowrap;
}
</style>
