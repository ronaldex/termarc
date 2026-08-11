<script setup lang="ts">
import { ref, watch } from "vue";
import type { Project, ProjectCommand, ProjectCommandMode } from "../types/project";
import SettingsActionRow from "./settings/SettingsActionRow.vue";
import SettingsButton from "./settings/SettingsButton.vue";
import SettingsCard from "./settings/SettingsCard.vue";
import SettingsField from "./settings/SettingsField.vue";
import SettingsFooter from "./settings/SettingsFooter.vue";
import SettingsPage from "./settings/SettingsPage.vue";
import SettingsSection from "./settings/SettingsSection.vue";

const props = defineProps<{ project: Project; command?: ProjectCommand }>();
const emit = defineEmits<{
  save: [project: Project, commandId: string];
  remove: [project: Project, commandId: string];
  cancel: [];
}>();

const draft = ref(createDraft());
const saved = ref(false);

watch(
  () => [props.project.id, props.command?.id] as const,
  () => {
    draft.value = createDraft();
    saved.value = false;
  },
);

function createDraft(): ProjectCommand {
  return props.command
    ? { ...props.command }
    : {
        id: `command-${Date.now()}`,
        name: "",
        command: "",
        mode: "single-shot",
      };
}

function selectMode(mode: ProjectCommandMode): void {
  draft.value.mode = mode;
}

function selectStorage(storage: "global" | "project"): void {
  draft.value.storage = storage;
}

function save(): void {
  const command = {
    ...draft.value,
    // Ordering remains owned by the live project state while this form is open.
    order: props.command?.order ?? draft.value.order,
    name: draft.value.name.trim(),
    command: draft.value.command.trim(),
  };
  const commands = [...(props.project.commands ?? [])];
  const index = commands.findIndex((item) => item.id === command.id);
  if (index >= 0) commands[index] = command;
  else commands.push(command);
  emit("save", { ...props.project, commands }, command.id);
  saved.value = true;
}

function remove(): void {
  if (!props.command) return;
  emit(
    "remove",
    {
      ...props.project,
      commands: (props.project.commands ?? []).filter((item) => item.id !== props.command?.id),
    },
    props.command.id,
  );
}
</script>

<template>
  <SettingsPage :title="project.name" :kind="command ? 'Edit command' : 'Add command'">
    <form @submit.prevent="save">
      <SettingsSection title="COMMAND CONFIGURATION">
        <SettingsCard>
          <SettingsField title="Name" description="The name shown in the project command list.">
            <input v-model="draft.name" required placeholder="Development server" />
          </SettingsField>

          <SettingsField
            title="CLI command"
            description="The shell command to run from the project directory."
          >
            <textarea
              v-model="draft.command"
              class="command-input"
              required
              rows="3"
              placeholder="npm run dev"
              spellcheck="false"
            ></textarea>
          </SettingsField>

          <SettingsField title="Storage" description="Choose where this command is saved." group>
            <div class="mode-options">
              <button
                type="button"
                class="mode-option"
                :class="{ selected: (draft.storage ?? 'global') === 'global' }"
                @click="selectStorage('global')"
              >
                <span class="radio"></span>
                <span><strong>Global</strong><small>Available on this Mac.</small></span>
              </button>
              <button
                type="button"
                class="mode-option"
                :class="{ selected: draft.storage === 'project' }"
                @click="selectStorage('project')"
              >
                <span class="radio"></span>
                <span
                  ><strong>Project-local</strong
                  ><small>Saved in .termarc.json in this project.</small></span
                >
              </button>
            </div>
          </SettingsField>

          <SettingsField
            title="Run mode"
            description="Choose whether the command exits or keeps running."
            group
          >
            <div class="mode-options">
              <button
                type="button"
                class="mode-option"
                :class="{ selected: draft.mode === 'single-shot' }"
                @click="selectMode('single-shot')"
              >
                <span class="radio"></span>
                <span
                  ><strong>One shot</strong><small>Run once and exit when complete.</small></span
                >
              </button>
              <button
                type="button"
                class="mode-option"
                :class="{ selected: draft.mode === 'persistent' }"
                @click="selectMode('persistent')"
              >
                <span class="radio"></span>
                <span><strong>Continuous</strong><small>Keep running until stopped.</small></span>
              </button>
            </div>
          </SettingsField>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection v-if="command" title="DANGER ZONE" danger>
        <SettingsCard>
          <SettingsActionRow
            title="Delete command"
            description="Remove this command from the project configuration."
          >
            <SettingsButton type="button" variant="danger" @click="remove">
              Delete command
            </SettingsButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsFooter>
        <span v-if="saved" class="saved">Command saved</span>
        <SettingsButton type="button" @click="emit('cancel')">Cancel</SettingsButton>
        <SettingsButton type="submit" variant="primary">
          {{ command ? "Save changes" : "Add command" }}
        </SettingsButton>
      </SettingsFooter>
    </form>
  </SettingsPage>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
.command-input {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
.mode-options {
  display: grid;
  gap: 0.5rem;
}
.mode-option {
  display: flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-raised);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mode-option:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-active);
}
.mode-option.selected {
  border-color: var(--color-text-faint);
  background: var(--color-surface-raised);
}
.mode-option strong,
.mode-option small {
  display: block;
}
.mode-option strong {
  margin-bottom: 0.125rem;
  font-size: 0.6875rem;
  font-weight: 500;
}
.mode-option small {
  color: var(--color-text-subtle);
  font-size: 0.5625rem;
}
.radio {
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 auto;
  border: 1px solid var(--color-border-strong);
  border-radius: 50%;
}
.selected .radio {
  border: 3px solid var(--color-text-muted);
}
.saved {
  margin-right: auto;
  color: var(--color-status-running);
  font-size: 0.625rem;
}
</style>
