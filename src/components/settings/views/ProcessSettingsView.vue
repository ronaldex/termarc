<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { selectDirectory } from "../../../api/dialog";
import type { Project, ProjectCommand, ProjectCommandStorage } from "../../../types/project";
import DirectoryField from "../../form/fields/DirectoryField.vue";
import RadioGroup from "../../form/fields/RadioGroup.vue";
import TextareaField from "../../form/fields/TextareaField.vue";
import TextField from "../../form/fields/TextField.vue";
import ToggleField from "../../form/fields/ToggleField.vue";
import SettingsActionRow from "../SettingsActionRow.vue";
import SettingsCard from "../SettingsCard.vue";
import SettingsFooter from "../SettingsFooter.vue";
import SettingsPage from "../SettingsPage.vue";
import SettingsSection from "../SettingsSection.vue";
import AppButton from "../../ui/AppButton.vue";

const props = defineProps<{
  project: Project;
  command?: ProjectCommand;
  category?: "command" | "agent";
}>();
const emit = defineEmits<{
  save: [project: Project, commandId: string];
  remove: [project: Project, commandId: string];
  cancel: [];
}>();

const draft = ref(createDraft());
const saved = ref(false);

watch(
  () => [props.project.id, props.command?.id, props.category] as const,
  () => {
    draft.value = createDraft();
    saved.value = false;
  },
);

function createDraft(): ProjectCommand {
  return props.command
    ? { ...props.command }
    : {
        id: `${props.category ?? "command"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        command: "",
      };
}

const storage = computed<ProjectCommandStorage>({
  get: () => draft.value.storage ?? "global",
  set: (value) => {
    draft.value.storage = value;
  },
});
const autostart = computed({
  get: () => Boolean(draft.value.autostart),
  set: (enabled: boolean) => {
    draft.value.autostart = enabled || undefined;
  },
});
const autoRestart = computed({
  get: () => Boolean(draft.value.autoRestart),
  set: (enabled: boolean) => {
    draft.value.autoRestart = enabled ? { maxRetries: 3, retryWindowSeconds: 60 } : undefined;
  },
});
const processLabel = computed(() => (props.category === "agent" ? "agent" : "command"));
const storageOptions = [
  { value: "global", label: "Global", description: "Available on this Mac." },
  {
    value: "project",
    label: "Project-local",
    description: "Saved in .termarc.json in this project.",
  },
] as const;

async function browseDirectory(): Promise<void> {
  const current = draft.value.directory?.trim() ?? "";
  const selected = await selectDirectory({
    title: "Select working directory",
    defaultPath: current || (props.project.directory !== "." ? props.project.directory : undefined),
  }).catch((error) => {
    console.error("Could not open directory picker", error);
    return null;
  });
  if (selected) {
    draft.value.directory = selected;
    saved.value = false;
  }
}

function save(): void {
  const command = {
    ...draft.value,
    // Ordering remains owned by the live project state while this form is open.
    order: props.command?.order ?? draft.value.order,
    name: draft.value.name.trim(),
    command: draft.value.command.trim(),
    directory: draft.value.directory?.trim() || undefined,
    autostart: draft.value.autostart || undefined,
    // Keep the retry policy bounded and consistent across all commands and agents.
    autoRestart: draft.value.autoRestart ? { maxRetries: 3, retryWindowSeconds: 60 } : undefined,
  };
  const items = [
    ...(props.category === "agent" ? (props.project.agents ?? []) : (props.project.commands ?? [])),
  ];
  const index = items.findIndex((item) => item.id === command.id);
  if (index >= 0) items[index] = command;
  else items.push(command);
  emit(
    "save",
    props.category === "agent"
      ? { ...props.project, agents: items }
      : { ...props.project, commands: items },
    command.id,
  );
  saved.value = true;
}

function remove(): void {
  if (!props.command) return;
  emit(
    "remove",
    props.category === "agent"
      ? {
          ...props.project,
          agents: (props.project.agents ?? []).filter((item) => item.id !== props.command?.id),
        }
      : {
          ...props.project,
          commands: (props.project.commands ?? []).filter((item) => item.id !== props.command?.id),
        },
    props.command.id,
  );
}
</script>

<template>
  <SettingsPage
    :title="project.name"
    :kind="
      category === 'agent'
        ? command
          ? 'Edit agent'
          : 'Add agent'
        : command
          ? 'Edit command'
          : 'Add command'
    "
  >
    <form @submit.prevent="save">
      <SettingsSection
        :title="category === 'agent' ? 'AGENT CONFIGURATION' : 'COMMAND CONFIGURATION'"
      >
        <SettingsCard>
          <TextField
            v-model="draft.name"
            label="Name"
            :description="`The name shown in the project ${category === 'agent' ? 'agent' : 'command'} list.`"
            required
            placeholder="Development server"
          />

          <TextareaField
            v-model="draft.command"
            class="command-input"
            label="CLI command"
            description="The shell command to run from the project directory."
            required
            rows="3"
            placeholder="npm run dev"
            spellcheck="false"
          />

          <RadioGroup
            v-model="storage"
            label="Storage"
            description="Choose where this process is saved."
            :options="storageOptions"
          />

          <ToggleField
            v-model="autostart"
            label="Startup"
            description="Optionally run this process when the project is started."
            control-label="Autostart"
            control-description="Run from the project-row start action."
          />

          <ToggleField
            v-model="autoRestart"
            label="Auto restart"
            description="Restart after unexpected exits, up to 3 retries within 60 seconds."
            control-label="Restart automatically"
            control-description="Successful exits and manual stops never trigger a restart."
          />

          <DirectoryField
            v-model="draft.directory"
            label="Working directory"
            description="The directory the process runs from. Leave empty to use the project directory."
            placeholder="Use project directory"
            @browse="browseDirectory"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection v-if="command" title="DANGER ZONE" danger>
        <SettingsCard>
          <SettingsActionRow
            :title="`Delete ${processLabel}`"
            :description="`Remove this ${processLabel} from the project configuration.`"
          >
            <AppButton type="button" variant="danger" @click="remove">
              Delete {{ processLabel }}
            </AppButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsFooter>
        <span v-if="saved" class="saved">{{ processLabel }} saved</span>
        <AppButton type="button" @click="emit('cancel')">Cancel</AppButton>
        <AppButton type="submit" variant="primary">
          {{ command ? "Save changes" : `Add ${processLabel}` }}
        </AppButton>
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
.saved {
  margin-right: auto;
  color: var(--color-status-running);
  font-size: 0.625rem;
}
</style>
