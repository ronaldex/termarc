<script setup lang="ts">
import { ref, watch } from "vue";
import type { Project } from "../types/project";
import SettingsActionRow from "./settings/SettingsActionRow.vue";
import SettingsButton from "./settings/SettingsButton.vue";
import SettingsCard from "./settings/SettingsCard.vue";
import SettingsField from "./settings/SettingsField.vue";
import SettingsFooter from "./settings/SettingsFooter.vue";
import SettingsPage from "./settings/SettingsPage.vue";
import SettingsSection from "./settings/SettingsSection.vue";

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{
  save: [project: Project];
  remove: [id: string];
  addCommand: [];
  editCommand: [commandId: string];
}>();
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

function removeCommand(commandId: string): void {
  draft.value.commands = (draft.value.commands ?? []).filter((command) => command.id !== commandId);
  saved.value = false;
}

function commandModeLabel(mode: string): string {
  return mode === "single-shot" ? "One shot" : "Continuous";
}
</script>

<template>
  <SettingsPage :title="project.name" kind="Project settings">
    <form @submit.prevent="save">
      <SettingsSection title="SETTINGS">
        <SettingsCard>
          <SettingsField title="Name" description="The name shown in the project tree.">
            <input v-model="draft.name" required />
          </SettingsField>
          <SettingsField
            title="Project directory"
            description="Terminals and commands run from this directory by default."
          >
            <input v-model="draft.directory" required spellcheck="false" />
          </SettingsField>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="COMMANDS">
        <template #action>
          <SettingsButton type="button" size="compact" @click="emit('addCommand')">
            ＋ Add command
          </SettingsButton>
        </template>
        <SettingsCard v-if="draft.commands?.length">
          <div v-for="command in draft.commands" :key="command.id" class="command-row">
            <button type="button" class="command-details" @click="emit('editCommand', command.id)">
              <span class="command-icon" aria-hidden="true">›_</span>
              <span>
                <strong>{{ command.name }}</strong>
                <code>{{ command.command }}</code>
              </span>
            </button>
            <span class="command-mode">{{ commandModeLabel(command.mode) }}</span>
            <SettingsButton
              type="button"
              variant="danger"
              :aria-label="`Remove ${command.name}`"
              @click="removeCommand(command.id)"
            >
              Remove
            </SettingsButton>
          </div>
        </SettingsCard>
        <SettingsCard v-else>
          <SettingsActionRow description="No commands configured for this project.">
            <SettingsButton type="button" @click="emit('addCommand')">Add command</SettingsButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="DANGER ZONE" danger>
        <SettingsCard>
          <SettingsActionRow
            title="Delete project"
            description="Remove this project from Termdeck. Project files are not deleted."
          >
            <SettingsButton type="button" variant="danger" @click="emit('remove', project.id)">
              Delete project
            </SettingsButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsFooter>
        <span v-if="saved" class="saved">Changes saved</span>
        <SettingsButton type="submit" variant="primary">Save changes</SettingsButton>
      </SettingsFooter>
    </form>
  </SettingsPage>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
.command-row {
  display: flex;
  min-height: 4rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
}
.command-details {
  display: flex;
  min-width: 0;
  height: auto;
  flex: 1;
  align-items: center;
  gap: 0.75rem;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.command-details > span:last-child {
  min-width: 0;
}
.command-details strong,
.command-details code {
  display: block;
}
.command-details strong {
  margin-bottom: 0.25rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 500;
}
.command-details code {
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-3);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5625rem;
}
.command-mode {
  padding: 0.25rem 0.5rem;
  border-radius: 0.625rem;
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  font-size: 0.5625rem;
}
.saved {
  color: var(--color-status-running);
  font-size: 0.625rem;
}
</style>
