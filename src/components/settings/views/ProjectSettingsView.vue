<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { selectDirectory } from "../../../api/dialog";
import { useAppSettings } from "../../../composables/useAppSettings";
import { EXTERNAL_EDITOR_OPTIONS, externalEditorLabel } from "../../../settings/options";
import type { Project } from "../../../types/project";
import type { ExternalEditor } from "../../../types/settings";
import DirectoryField from "../../form/fields/DirectoryField.vue";
import SelectField from "../../form/fields/SelectField.vue";
import TextField from "../../form/fields/TextField.vue";
import SettingsActionRow from "../SettingsActionRow.vue";
import SettingsCard from "../SettingsCard.vue";
import SettingsFooter from "../SettingsFooter.vue";
import SettingsPage from "../SettingsPage.vue";
import SettingsProcessRow from "../SettingsProcessRow.vue";
import SettingsSection from "../SettingsSection.vue";
import AppButton from "../../ui/AppButton.vue";

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{
  save: [project: Project];
  remove: [id: string];
  addCommand: [];
  addAgent: [];
  editCommand: [commandId: string];
  editAgent: [agentId: string];
  removeCommand: [commandId: string];
  removeAgent: [agentId: string];
}>();
const { settings } = useAppSettings();
const draft = ref(copyProject(props.project));
const saved = ref(false);
const editorOverride = computed<ExternalEditor | "">({
  get: () => draft.value.externalEditor ?? "",
  set: (value) => {
    draft.value.externalEditor = value || undefined;
  },
});

watch(
  () => props.project,
  (project) => {
    draft.value = copyProject(project);
    saved.value = false;
  },
);
watch(
  () => props.project.commands,
  (commands) => {
    draft.value.commands = commands?.map((command) => ({ ...command })) ?? [];
  },
  { deep: true },
);
watch(
  () => props.project.agents,
  (agents) => {
    draft.value.agents = agents?.map((agent) => ({ ...agent })) ?? [];
  },
  { deep: true },
);

function copyProject(project: Project): Project {
  return {
    ...project,
    commands: project.commands?.map((command) => ({ ...command })) ?? [],
    agents: project.agents?.map((agent) => ({ ...agent })) ?? [],
  };
}

function save(): void {
  if (!draft.value.directory.trim()) return;
  emit("save", copyProject(draft.value));
  saved.value = true;
}

async function browseDirectory(): Promise<void> {
  const current = draft.value.directory.trim();
  const selected = await selectDirectory({
    title: "Select project directory",
    // Legacy placeholder directories have no usable location for the picker.
    defaultPath: current && current !== "." ? current : undefined,
  }).catch((error) => {
    console.error("Could not open directory picker", error);
    return null;
  });
  if (selected) {
    draft.value.directory = selected;
    saved.value = false;
  }
}
</script>

<template>
  <SettingsPage :title="project.name" kind="Project settings">
    <form @submit.prevent="save">
      <SettingsSection title="SETTINGS">
        <SettingsCard>
          <TextField
            v-model="draft.name"
            label="Name"
            description="The name shown in the project tree."
            required
          />
          <DirectoryField
            v-model="draft.directory"
            label="Project directory"
            description="Terminals and processes run from this directory by default."
            readonly
            @browse="browseDirectory"
          />
          <SelectField
            v-model="editorOverride"
            label="Editor"
            description="Override the app editor when opening files from this project."
          >
            <option value="">
              Use app setting ({{ externalEditorLabel(settings.externalEditor) }})
            </option>
            <option
              v-for="editor in EXTERNAL_EDITOR_OPTIONS"
              :key="editor.value"
              :value="editor.value"
            >
              {{ editor.label }}
            </option>
          </SelectField>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="AGENTS">
        <template #action>
          <AppButton type="button" size="compact" @click="emit('addAgent')">＋ Add agent</AppButton>
        </template>
        <SettingsCard v-if="draft.agents?.length">
          <SettingsProcessRow
            v-for="agent in draft.agents"
            :key="agent.id"
            :name="agent.name"
            :command="agent.command"
            :storage="agent.storage ?? 'global'"
            icon="✦"
            :remove-label="`Remove ${agent.name}`"
            @edit="emit('editAgent', agent.id)"
            @remove="emit('removeAgent', agent.id)"
          />
        </SettingsCard>
        <SettingsCard v-else>
          <SettingsActionRow description="No agents configured for this project.">
            <AppButton type="button" @click="emit('addAgent')">Add agent</AppButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="COMMANDS">
        <template #action>
          <AppButton type="button" size="compact" @click="emit('addCommand')">
            ＋ Add command
          </AppButton>
        </template>
        <SettingsCard v-if="draft.commands?.length">
          <SettingsProcessRow
            v-for="command in draft.commands"
            :key="command.id"
            :name="command.name"
            :command="command.command"
            :storage="command.storage ?? 'global'"
            icon="›_"
            :remove-label="`Remove ${command.name}`"
            @edit="emit('editCommand', command.id)"
            @remove="emit('removeCommand', command.id)"
          />
        </SettingsCard>
        <SettingsCard v-else>
          <SettingsActionRow description="No commands configured for this project.">
            <AppButton type="button" @click="emit('addCommand')">Add command</AppButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="DANGER ZONE" danger>
        <SettingsCard>
          <SettingsActionRow
            title="Delete project"
            description="Remove this project from Termarc. Project files are not deleted."
          >
            <AppButton type="button" variant="danger" @click="emit('remove', project.id)">
              Delete project
            </AppButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsFooter>
        <span v-if="saved" class="saved">Changes saved</span>
        <AppButton type="submit" variant="primary">Save changes</AppButton>
      </SettingsFooter>
    </form>
  </SettingsPage>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
.saved {
  color: var(--color-status-running);
  font-size: 0.625rem;
}
</style>
