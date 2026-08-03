<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

const props = defineProps<{
  initialName?: string;
}>();
const emit = defineEmits<{
  save: [name: string];
  cancel: [];
}>();

const name = ref(props.initialName ?? "");
const modal = ref<HTMLFormElement>();
const input = ref<HTMLInputElement>();

function save(): void {
  emit("save", name.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = Array.from(
    modal.value?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? [],
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

onMounted(async () => {
  await nextTick();
  input.value?.focus();
  input.value?.select();
});
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @mousedown.self="emit('cancel')" @contextmenu.prevent>
      <form
        ref="modal"
        class="rename-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        @submit.prevent="save"
        @keydown="handleKeydown"
      >
        <header>
          <h2 id="rename-title">Change terminal name</h2>
          <p>Use a custom name instead of the terminal’s automatic title.</p>
        </header>
        <label>
          Terminal name
          <input
            ref="input"
            v-model="name"
            type="text"
            maxlength="100"
            placeholder="e.g. Frontend"
          />
        </label>
        <p class="hint">Leave blank to use the automatic title again.</p>
        <footer>
          <button type="button" @click="emit('cancel')">Cancel</button>
          <button type="submit" class="primary">Save name</button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: grid;
  padding: 1rem;
  background: rgb(0 0 0 / 45%);
  place-items: center;
}
.rename-modal {
  width: min(100%, 25rem);
  padding: 1.25rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.625rem;
  box-shadow: 0 1.25rem 3.5rem rgb(0 0 0 / 40%);
  color: var(--color-text);
  background: var(--color-surface-1);
  font: inherit;
}
header h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 0.875rem;
}
header p,
.hint {
  margin: 0.375rem 0 0;
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
  line-height: 1.4;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}
input {
  width: 100%;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-0);
  font: inherit;
  font-size: 0.75rem;
}
input:focus {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-focus) 35%, transparent);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
button {
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-2);
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}
button:hover,
button:focus-visible {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
button.primary {
  border-color: var(--color-accent-bg);
  color: var(--color-text-strong);
  background: var(--color-accent-bg);
}
</style>
