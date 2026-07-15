<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Project } from "../types/project";

const props = defineProps<{
  projects: Project[];
  initialProjectId?: string;
}>();
const emit = defineEmits<{
  close: [];
  add: [];
  save: [project: Project];
  remove: [id: string];
}>();

const dialog = ref<HTMLElement>();
const draft = ref<Project | null>(null);
let previouslyFocused: HTMLElement | null = null;

watch(
  () => props.initialProjectId,
  (id) => {
    draft.value = id ? copyProject(props.projects.find((project) => project.id === id)) : null;
  },
  { immediate: true },
);

onMounted(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  window.addEventListener("keydown", handleEscape);
  await nextTick();
  dialog.value?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleEscape);
  previouslyFocused?.focus();
});

function copyProject(project?: Project): Project | null {
  return project
    ? { ...project, commands: project.commands?.map((command) => ({ ...command })) }
    : null;
}

function editProject(project: Project): void {
  draft.value = copyProject(project);
  void nextTick(() => dialog.value?.querySelector<HTMLInputElement>("input")?.focus());
}

function saveProject(): void {
  if (!draft.value) return;
  emit("save", draft.value);
  draft.value = null;
}

function removeProject(): void {
  if (!draft.value) return;
  emit("remove", draft.value.id);
  draft.value = null;
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !dialog.value) return;

  const focusable = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === dialog.value)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="project-manager"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-manager-title"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header>
        <strong id="project-manager-title">Manage projects</strong>
        <button type="button" aria-label="Close project manager" @click="emit('close')">×</button>
      </header>
      <div class="manager-body">
        <div class="project-picker">
          <button
            v-for="project in projects"
            :key="project.id"
            type="button"
            :class="{ selected: draft?.id === project.id }"
            @click="editProject(project)"
          >
            {{ project.name }}<small>{{ project.directory }}</small>
          </button>
          <button type="button" class="add-project" @click="emit('add')">＋ Add project</button>
        </div>
        <form v-if="draft" @submit.prevent="saveProject">
          <label>Name<input v-model="draft.name" required /></label>
          <label>Directory<input v-model="draft.directory" required /></label>
          <div class="form-actions">
            <button type="button" class="danger" @click="removeProject">Delete</button>
            <button type="submit">Save</button>
          </div>
        </form>
        <p v-else class="empty-manager">Select a project to edit its settings.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 42px 0 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: #0008;
}
.project-manager {
  width: min(650px, 90vw);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  outline: none;
  color: var(--color-text);
  background: #151923;
  box-shadow: 0 20px 60px #0009;
}
.project-manager header {
  display: flex;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #2a3040;
}
.project-manager header button {
  border: 0;
  color: #aeb7ca;
  background: none;
  font-size: 20px;
  cursor: pointer;
}
.manager-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 280px;
}
.project-picker {
  padding: 12px;
  border-right: 1px solid #2a3040;
}
.project-picker button {
  display: block;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 7px;
  color: #b8c0d2;
  background: none;
  text-align: left;
  cursor: pointer;
}
.project-picker button:hover,
.project-picker .selected {
  background: #242a38;
  color: #fff;
}
.project-picker small {
  display: block;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
}
.project-picker .add-project {
  margin-top: 10px;
  color: #8be9fd;
}
.project-manager form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
}
.project-manager label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8993a9;
  font-size: 11px;
}
.project-manager input {
  padding: 9px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-strong);
  background: var(--color-sidebar-bg-deep);
}
.form-actions {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
}
.form-actions button {
  padding: 8px 14px;
  border: 1px solid #3b4660;
  border-radius: 6px;
  color: #e6eaf2;
  background: #293149;
  cursor: pointer;
}
.form-actions .danger {
  color: var(--color-status-error);
  background: #321f28;
}
.empty-manager {
  padding: 22px;
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
