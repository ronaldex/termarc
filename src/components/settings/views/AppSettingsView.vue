<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  AGENT_EXTENSION_OPTIONS,
  getAgentExtensionStatus,
  installAgentExtension,
  removeAgentExtension,
  type AgentExtensionId,
  type AgentExtensionStatus,
} from "../../../api/agentExtensions";
import { installCliSymlink, isCliSymlinkInstalled, removeCliSymlink } from "../../../api/cli";
import { useAppSettings } from "../../../composables/useAppSettings";
import {
  EXTERNAL_EDITOR_OPTIONS,
  SHORTCUT_MODIFIER_OPTIONS,
  TERMINAL_FONT_OPTIONS,
  TERMINAL_FONT_SIZE_OPTIONS,
} from "../../../settings/options";
import { COLOR_THEME_OPTIONS } from "../../../themes/themeCatalog";
import { sendAgentReadyNotification } from "../../../services/agentNotifications";
import SelectField from "../../form/fields/SelectField.vue";
import ToggleField from "../../form/fields/ToggleField.vue";
import SettingsActionRow from "../SettingsActionRow.vue";
import SettingsCard from "../SettingsCard.vue";
import SettingsPage from "../SettingsPage.vue";
import SettingsSection from "../SettingsSection.vue";
import AppButton from "../../ui/AppButton.vue";

type ActionStatus = { kind: "success" | "error"; message: string };

const { settings } = useAppSettings();
const cliStatus = ref<ActionStatus>();
const cliInstalled = ref(false);
const cliBusy = ref(true);
const extensionStatuses = ref<Partial<Record<AgentExtensionId, ActionStatus>>>({});
const extensionInstallationStates = ref<Partial<Record<AgentExtensionId, AgentExtensionStatus>>>(
  {},
);
const extensionBusy = ref<AgentExtensionId>();
const extensionsLoaded = ref(false);
let extensionStatusRefresh: Promise<void> | undefined;

async function loadCliInstallationState(): Promise<void> {
  try {
    cliInstalled.value = await isCliSymlinkInstalled();
  } catch (error) {
    cliStatus.value = { kind: "error", message: String(error) };
  } finally {
    cliBusy.value = false;
  }
}

function refreshExtensionInstallationStates(): Promise<void> {
  if (extensionStatusRefresh) return extensionStatusRefresh;

  extensionsLoaded.value = false;
  extensionStatusRefresh = Promise.all(
    AGENT_EXTENSION_OPTIONS.map(async (extension) => {
      try {
        extensionInstallationStates.value[extension.id] = await getAgentExtensionStatus(
          extension.id,
        );
        if (extensionStatuses.value[extension.id]?.kind === "error") {
          extensionStatuses.value[extension.id] = undefined;
        }
      } catch (error) {
        extensionStatuses.value[extension.id] = { kind: "error", message: String(error) };
      }
    }),
  )
    .then(() => undefined)
    .finally(() => {
      extensionsLoaded.value = true;
      extensionStatusRefresh = undefined;
    });
  return extensionStatusRefresh;
}

async function loadInstallationStates(): Promise<void> {
  await Promise.all([loadCliInstallationState(), refreshExtensionInstallationStates()]);
}

function handleWindowFocus(): void {
  if (extensionBusy.value) return;
  void refreshExtensionInstallationStates();
}

async function toggleCli(enabled: boolean): Promise<void> {
  cliBusy.value = true;
  cliStatus.value = undefined;
  try {
    const path = enabled ? await installCliSymlink() : await removeCliSymlink();
    cliInstalled.value = enabled;
    cliStatus.value = {
      kind: "success",
      message: `${enabled ? "Installed at" : "Removed"} ${path}`,
    };
  } catch (error) {
    cliStatus.value = { kind: "error", message: String(error) };
  } finally {
    cliBusy.value = false;
  }
}

async function toggleExtension(
  agent: AgentExtensionId,
  reloadHint: string,
  enabled: boolean,
): Promise<void> {
  extensionBusy.value = agent;
  extensionStatuses.value[agent] = undefined;
  try {
    const path = enabled ? await installAgentExtension(agent) : await removeAgentExtension(agent);
    extensionInstallationStates.value[agent] = await getAgentExtensionStatus(agent);
    extensionStatuses.value[agent] = {
      kind: "success",
      message: enabled ? `Installed at ${path}. ${reloadHint}` : `Removed ${path}`,
    };
  } catch (error) {
    extensionStatuses.value[agent] = { kind: "error", message: String(error) };
  } finally {
    extensionBusy.value = undefined;
  }
}

function extensionVersionDescription(agent: AgentExtensionId): string {
  const state = extensionInstallationStates.value[agent];
  if (!state) return "Checking installed extension…";
  if (!state.installed) return `Not installed · Bundled with Termarc ${state.bundledVersion}`;
  if (state.updateAvailable)
    return `Update available · Bundled with Termarc ${state.bundledVersion}`;
  return `Up to date · Bundled with Termarc ${state.bundledVersion}`;
}

onMounted(() => {
  window.addEventListener("focus", handleWindowFocus);
  void loadInstallationStates();
});

onBeforeUnmount(() => window.removeEventListener("focus", handleWindowFocus));

function testAgentReadyNotification(): void {
  void sendAgentReadyNotification({
    body: "Termarc notifications are working.",
    notification: settings.notifyWhenAgentReady,
    sound: settings.playSoundWhenAgentReady,
  });
}
</script>

<template>
  <SettingsPage title="Termarc" kind="App settings">
    <form>
      <SettingsSection title="GENERAL">
        <SettingsCard>
          <SelectField
            v-model="settings.colorTheme"
            label="Color theme"
            description="The color theme used by Termarc."
          >
            <option v-for="theme in COLOR_THEME_OPTIONS" :key="theme.value" :value="theme.value">
              {{ theme.label }}
            </option>
          </SelectField>
          <SelectField
            v-model="settings.externalEditor"
            label="Editor"
            description="The editor used to open files from Termarc."
          >
            <option
              v-for="editor in EXTERNAL_EDITOR_OPTIONS"
              :key="editor.value"
              :value="editor.value"
            >
              {{ editor.label }}
            </option>
          </SelectField>
          <SelectField
            v-model="settings.shortcutModifier"
            label="Keyboard shortcut modifier"
            description="The modifier used for workspace shortcuts and terminal links. Defaults to Command on macOS and Control on Linux."
          >
            <option
              v-for="modifier in SHORTCUT_MODIFIER_OPTIONS"
              :key="modifier.value"
              :value="modifier.value"
            >
              {{ modifier.label }}
            </option>
          </SelectField>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="COMMAND LINE">
        <SettingsCard>
          <ToggleField
            :model-value="cliInstalled"
            label="Termarc CLI"
            description="Add a termarc symlink to ~/.local/bin so you can launch and manage Termarc from your shell."
            :disabled="cliBusy"
            @update:model-value="toggleCli"
          />
          <p
            v-if="cliStatus"
            class="action-status"
            :class="cliStatus.kind"
            :role="cliStatus.kind === 'error' ? 'alert' : 'status'"
          >
            {{ cliStatus.message }}
          </p>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="AGENT INTEGRATIONS">
        <SettingsCard>
          <template v-for="extension in AGENT_EXTENSION_OPTIONS" :key="extension.id">
            <ToggleField
              :model-value="extensionInstallationStates[extension.id]?.installed ?? false"
              :label="extension.name"
              :description="extension.description"
              :disabled="!extensionsLoaded || extensionBusy !== undefined"
              @update:model-value="toggleExtension(extension.id, extension.reloadHint, $event)"
            />
            <SettingsActionRow :description="extensionVersionDescription(extension.id)">
              <AppButton
                v-if="extensionInstallationStates[extension.id]?.updateAvailable"
                type="button"
                size="compact"
                :disabled="extensionBusy !== undefined"
                @click="toggleExtension(extension.id, extension.reloadHint, true)"
              >
                Update
              </AppButton>
            </SettingsActionRow>
            <p
              v-if="extensionStatuses[extension.id]"
              class="action-status"
              :class="extensionStatuses[extension.id]?.kind"
              :role="extensionStatuses[extension.id]?.kind === 'error' ? 'alert' : 'status'"
            >
              {{ extensionStatuses[extension.id]?.message }}
            </p>
          </template>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="TERMINAL">
        <SettingsCard>
          <SelectField
            v-model="settings.terminalFontFamily"
            label="Font family"
            description="The font family used for the terminal."
          >
            <option v-for="font in TERMINAL_FONT_OPTIONS" :key="font.value" :value="font.value">
              {{ font.label }}
            </option>
          </SelectField>
          <SelectField
            v-model="settings.terminalFontSize"
            label="Font size"
            description="The font size in pixels."
          >
            <option v-for="size in TERMINAL_FONT_SIZE_OPTIONS" :key="size" :value="size">
              {{ size }} px
            </option>
          </SelectField>
          <ToggleField
            v-model="settings.notifyWhenAgentReady"
            label="Agent ready notifications"
            description="Notify you whenever Pi finishes processing."
          />
          <ToggleField
            v-model="settings.playSoundWhenAgentReady"
            label="Agent ready sound"
            description="Play a sound whenever Pi finishes processing."
          />
          <SettingsActionRow
            description="Use this to confirm that your selected alerts are working."
          >
            <AppButton type="button" @click="testAgentReadyNotification">
              Test notification
            </AppButton>
          </SettingsActionRow>
        </SettingsCard>
      </SettingsSection>
    </form>
  </SettingsPage>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
}
.action-status {
  margin: 0 0.75rem 0.75rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.625rem;
  overflow-wrap: anywhere;
}
.action-status.success {
  color: var(--color-status-running);
  background: var(--color-success-bg);
}
.action-status.error {
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
</style>
