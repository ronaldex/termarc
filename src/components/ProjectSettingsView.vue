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
    <header class="page-header">
      <strong>{{ project.name }}</strong>
      <span class="edit-icon" aria-hidden="true">⌁</span>
      <span class="page-kind">Project settings</span>
    </header>

    <div class="page-content">
      <span class="section-label">SETTINGS</span>
      <form @submit.prevent="save">
        <div class="settings-card">
          <label>
            <span class="field-copy"
              ><strong>Name</strong><small>The name shown in the project tree.</small></span
            >
            <input v-model="draft.name" required />
          </label>
          <label>
            <span class="field-copy"
              ><strong>Project directory</strong
              ><small>Terminals and commands run from this directory by default.</small></span
            >
            <input v-model="draft.directory" required spellcheck="false" />
          </label>
        </div>

        <span class="section-label danger-label">DANGER ZONE</span>
        <div class="danger-card">
          <span
            ><strong>Delete project</strong
            ><small>Remove this project from Termdeck. Project files are not deleted.</small></span
          >
          <button type="button" class="danger" @click="emit('remove', project.id)">
            Delete project
          </button>
        </div>

        <div class="form-footer">
          <span v-if="saved" class="saved">Changes saved</span>
          <button type="submit" class="primary">Save changes</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.settings-view {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--color-text);
  background: #111214;
}
.page-header {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border-bottom: 1px solid var(--color-border);
  background: #111214;
}
.page-header strong {
  color: var(--color-text-strong);
  font-size: 12px;
}
.edit-icon {
  color: #8a8d95;
  font-size: 16px;
  transform: rotate(-30deg);
}
.page-kind {
  margin-left: 2px;
  padding-left: 14px;
  border-left: 1px solid #303238;
  color: var(--color-text-muted);
  font-size: 10px;
}
.page-content {
  width: min(760px, calc(100% - 44px));
  padding: 34px 0 48px;
  margin: 0 auto;
}
.section-label {
  display: block;
  margin: 0 0 14px;
  color: #8a8d95;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.05em;
}
form {
  display: flex;
  flex-direction: column;
}
.settings-card,
.danger-card {
  overflow: hidden;
  border: 1px solid #33353a;
  border-radius: 10px;
  background: #121315;
}
.settings-card label {
  display: grid;
  min-height: 64px;
  grid-template-columns: minmax(190px, 1fr) minmax(250px, 330px);
  align-items: center;
  gap: 24px;
  padding: 12px 15px;
}
.settings-card label + label {
  border-top: 1px solid #33353a;
}
.field-copy strong,
.field-copy small,
.danger-card strong,
.danger-card small {
  display: block;
}
.field-copy strong,
.danger-card strong {
  margin-bottom: 3px;
  color: #e0e1e4;
  font-size: 12px;
  font-weight: 500;
}
.field-copy small,
.danger-card small {
  color: #9699a1;
  font-size: 10px;
  line-height: 1.35;
}
input {
  width: 100%;
  height: 31px;
  padding: 0 10px;
  border: 1px solid #3a3c42;
  border-radius: 6px;
  outline: none;
  color: #e4e5e8;
  background: #17181b;
  font-size: 11px;
}
input:focus {
  border-color: #61656f;
  box-shadow: 0 0 0 1px #61656f33;
}
.danger-label {
  margin-top: 38px;
}
.danger-card {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 15px;
}
button {
  height: 31px;
  padding: 0 12px;
  border: 1px solid #3a3c42;
  border-radius: 6px;
  color: #d8d9dc;
  background: #1a1b1f;
  font-size: 11px;
  cursor: pointer;
}
button:hover {
  border-color: #50535b;
  background: #202126;
}
.danger {
  flex: 0 0 auto;
  color: #e78a91;
}
.form-footer {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.primary {
  border-color: #48536f;
  color: #eceef4;
  background: #293149;
}
.saved {
  color: var(--color-status-running);
  font-size: 10px;
}
@media (max-width: 760px) {
  .settings-card label {
    grid-template-columns: 1fr;
    gap: 9px;
  }
  .danger-card {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
