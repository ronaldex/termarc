<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { TerminalCloseChoice } from "../../utils/parentClose";

defineProps<{ childCount: number; runningProcessCount: number }>();
const emit = defineEmits<{ choose: [choice: TerminalCloseChoice] }>();
const dialog = ref<HTMLElement>();
const cancelButton = ref<HTMLButtonElement>();
const confirmButton = ref<HTMLButtonElement>();

function handleKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    emit("choose", "cancel");
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    cancelButton.value?.focus();
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    confirmButton.value?.focus();
    return;
  }
  const focusable = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
  );
  if (event.key !== "Tab") return;

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

onMounted(() => {
  window.addEventListener("keydown", handleKeydown, true);
  void nextTick(() => cancelButton.value?.focus());
});
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown, true));
</script>

<template>
  <Teleport to="body">
    <div class="parent-close-backdrop" @mousedown.self="emit('choose', 'cancel')">
      <section
        ref="dialog"
        class="parent-close-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-close-title"
      >
        <header>
          <h2 id="parent-close-title">Close terminal with a running process?</h2>
          <p>
            {{ runningProcessCount }} running
            {{ runningProcessCount === 1 ? "process will" : "processes will" }} be stopped.
            <template v-if="childCount">
              This will also close {{ childCount }}
              {{ childCount === 1 ? "subterminal" : "subterminals" }}.
            </template>
          </p>
        </header>
        <footer>
          <button ref="cancelButton" type="button" @click="emit('choose', 'cancel')">Cancel</button>
          <button ref="confirmButton" class="danger" type="button" @click="emit('choose', 'close')">
            Close terminal
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.parent-close-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: grid;
  padding: 1rem;
  background: rgb(0 0 0 / 45%);
  place-items: center;
}
.parent-close-dialog {
  width: min(100%, 31rem);
  padding: 1.25rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.625rem;
  box-shadow: 0 1.25rem 3.5rem rgb(0 0 0 / 40%);
  color: var(--color-text);
  background: var(--color-surface-raised);
}
h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 0.875rem;
}
p {
  margin: 0.375rem 0 0;
  color: var(--color-text-subtle);
  font-size: 0.75rem;
}
footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
button {
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-active);
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}
button:hover,
button:focus-visible {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
button.danger {
  border-color: var(--color-status-error);
  color: var(--color-text-strong);
}
</style>
