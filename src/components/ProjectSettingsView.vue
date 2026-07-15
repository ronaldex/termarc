<script setup lang="ts">
import { ref, watch } from "vue";
import type { Project } from "../types/project";

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{ save: [project: Project]; remove: [id: string] }>();
const draft = ref(copyProject(props.project));
const saved = ref(false);

watch(
  () => props.project,
  (project) => {
    draft.value = copyProject(project);
    saved.value = false;
  },
);

function copyProject(project: Project): Project {
  return { ...project, commands: project.commands?.map((command) => ({ ...command })) ?? [] };
}

function save(): void {
  emit("save", copyProject(draft.value));
  saved.value = true;
}
</script>

<template>
  <section class="settings-view">
    <header>
      <div>
        <span class="eyebrow">PROJECT</span>
        <h1>{{ project.name }}</h1>
        <p>{{ project.directory }}</p>
      </div>
    </header>
    <form @submit.prevent="save">
      <label
        ><span>Name</span><small>The name shown in the project tree.</small
        ><input v-model="draft.name" required
      /></label>
      <label
        ><span>Project directory</span
        ><small>Terminals and commands run from this directory by default.</small
        ><input v-model="draft.directory" required spellcheck="false"
      /></label>
      <div class="form-footer">
        <button type="button" class="danger" @click="emit('remove', project.id)">
          Delete project
        </button>
        <span v-if="saved" class="saved">Saved</span>
        <button type="submit" class="primary">Save changes</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.settings-view {
  width: min(680px, calc(100% - 64px));
  margin: 0 auto;
  padding: 54px 0;
  color: var(--color-text);
}
header {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border);
}
.eyebrow {
  color: var(--color-text-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
h1 {
  margin: 8px 0 4px;
  color: var(--color-text-strong);
  font-size: 22px;
}
header p {
  margin: 0;
  color: var(--color-text-muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 26px;
}
label {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: center;
  gap: 4px 20px;
  color: var(--color-text);
  font-size: 12px;
}
label small {
  grid-column: 1;
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1.4;
}
input {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  outline: none;
  color: var(--color-text-strong);
  background: var(--color-sidebar-bg-deep);
}
input:focus {
  border-color: var(--color-focus);
}
.form-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
button {
  padding: 8px 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text);
  background: #1a1e28;
  cursor: pointer;
}
.primary {
  margin-left: auto;
  border-color: #465b91;
  background: #293b68;
}
.danger {
  color: var(--color-status-error);
  background: #321f28;
}
.saved {
  color: var(--color-status-running);
  font-size: 10px;
}
</style>
