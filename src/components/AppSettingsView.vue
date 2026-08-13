<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  AGENT_EXTENSION_OPTIONS,
  installAgentExtension,
  isAgentExtensionInstalled,
  removeAgentExtension,
  type AgentExtensionId,
} from "../api/agentExtensions";
import { installCliSymlink, isCliSymlinkInstalled, removeCliSymlink } from "../api/cli";
import { useAppSettings } from "../composables/useAppSettings";
import {
  EXTERNAL_EDITOR_OPTIONS,
  SHORTCUT_MODIFIER_OPTIONS,
  TERMINAL_FONT_OPTIONS,
  TERMINAL_FONT_SIZE_OPTIONS,
} from "../settings/options";
import { COLOR_THEME_OPTIONS } from "../themes/themeCatalog";
import { sendAgentReadyNotification } from "../services/agentNotifications";
import SettingsActionRow from "./settings/SettingsActionRow.vue";
import SettingsButton from "./settings/SettingsButton.vue";
import SettingsCard from "./settings/SettingsCard.vue";
import SettingsField from "./settings/SettingsField.vue";
import SettingsPage from "./settings/SettingsPage.vue";
import SettingsSection from "./settings/SettingsSection.vue";
import SettingsToggle from "./settings/SettingsToggle.vue";

type ActionStatus = { kind: "success" | "error"; message: string };

const { settings } = useAppSettings();
const cliStatus = ref<ActionStatus>();
const cliInstalled = ref(false);
const cliBusy = ref(true);
const extensionStatuses = ref<Partial<Record<AgentExtensionId, ActionStatus>>>({});
const extensionInstalled = ref<Partial<Record<AgentExtensionId, boolean>>>({});
const extensionBusy = ref<AgentExtensionId>();
const extensionsLoaded = ref(false);

function checkboxValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

async function loadInstallationStates(): Promise<void> {
  try {
    cliInstalled.value = await isCliSymlinkInstalled();
  } catch (error) {
    cliStatus.value = { kind: "error", message: String(error) };
  } finally {
    cliBusy.value = false;
  }

  await Promise.all(
    AGENT_EXTENSION_OPTIONS.map(async (extension) => {
      try {
        extensionInstalled.value[extension.id] = await isAgentExtensionInstalled(extension.id);
      } catch (error) {
        extensionStatuses.value[extension.id] = { kind: "error", message: String(error) };
      }
    }),
  );
  extensionsLoaded.value = true;
}

async function toggleCli(event: Event): Promise<void> {
  const enabled = checkboxValue(event);
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
    (event.target as HTMLInputElement).checked = cliInstalled.value;
    cliStatus.value = { kind: "error", message: String(error) };
  } finally {
    cliBusy.value = false;
  }
}

async function toggleExtension(
  agent: AgentExtensionId,
  reloadHint: string,
  event: Event,
): Promise<void> {
  const enabled = checkboxValue(event);
  extensionBusy.value = agent;
  extensionStatuses.value[agent] = undefined;
  try {
    const path = enabled ? await installAgentExtension(agent) : await removeAgentExtension(agent);
    extensionInstalled.value[agent] = enabled;
    extensionStatuses.value[agent] = {
      kind: "success",
      message: enabled ? `Installed at ${path}. ${reloadHint}` : `Removed ${path}`,
    };
  } catch (error) {
    (event.target as HTMLInputElement).checked = extensionInstalled.value[agent] ?? false;
    extensionStatuses.value[agent] = { kind: "error", message: String(error) };
  } finally {
    extensionBusy.value = undefined;
  }
}

onMounted(() => void loadInstallationStates());

function updateNotificationSetting(
  setting: "notifyWhenAgentReady" | "playSoundWhenAgentReady",
  event: Event,
): void {
  settings[setting] = checkboxValue(event);
}

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
          <SettingsField title="Color theme" description="The color theme used by Termarc.">
            <select v-model="settings.colorTheme">
              <option v-for="theme in COLOR_THEME_OPTIONS" :key="theme.value" :value="theme.value">
                {{ theme.label }}
              </option>
            </select>
          </SettingsField>
          <SettingsField title="Editor" description="The editor used to open files from Termarc.">
            <select v-model="settings.externalEditor">
              <option
                v-for="editor in EXTERNAL_EDITOR_OPTIONS"
                :key="editor.value"
                :value="editor.value"
              >
                {{ editor.label }}
              </option>
            </select>
          </SettingsField>
          <SettingsField
            title="Keyboard shortcut modifier"
            description="The modifier used for workspace shortcuts and terminal links. Defaults to Command on macOS and Control on Linux."
          >
            <select v-model="settings.shortcutModifier">
              <option
                v-for="modifier in SHORTCUT_MODIFIER_OPTIONS"
                :key="modifier.value"
                :value="modifier.value"
              >
                {{ modifier.label }}
              </option>
            </select>
          </SettingsField>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="COMMAND LINE">
        <SettingsCard>
          <SettingsField
            title="Termarc CLI"
            description="Add a termarc symlink to ~/.local/bin so you can launch and manage Termarc from your shell."
          >
            <SettingsToggle
              label="Install Termarc CLI symlink"
              :checked="cliInstalled"
              :disabled="cliBusy"
              @change="toggleCli"
            />
          </SettingsField>
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
            <SettingsField :title="extension.name" :description="extension.description">
              <SettingsToggle
                :label="`Install ${extension.name} extension`"
                :checked="extensionInstalled[extension.id] ?? false"
                :disabled="!extensionsLoaded || extensionBusy !== undefined"
                @change="toggleExtension(extension.id, extension.reloadHint, $event)"
              />
            </SettingsField>
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
          <SettingsField title="Font family" description="The font family used for the terminal.">
            <select v-model="settings.terminalFontFamily">
              <option v-for="font in TERMINAL_FONT_OPTIONS" :key="font.value" :value="font.value">
                {{ font.label }}
              </option>
            </select>
          </SettingsField>
          <SettingsField title="Font size" description="The font size in pixels.">
            <select v-model.number="settings.terminalFontSize">
              <option v-for="size in TERMINAL_FONT_SIZE_OPTIONS" :key="size" :value="size">
                {{ size }} px
              </option>
            </select>
          </SettingsField>
          <SettingsField
            title="Agent ready notifications"
            description="Notify you whenever Pi finishes processing."
          >
            <SettingsToggle
              label="Enable agent ready notifications"
              :checked="settings.notifyWhenAgentReady"
              @change="updateNotificationSetting('notifyWhenAgentReady', $event)"
            />
          </SettingsField>
          <SettingsField
            title="Agent ready sound"
            description="Play a sound whenever Pi finishes processing."
          >
            <SettingsToggle
              label="Enable agent ready sound"
              :checked="settings.playSoundWhenAgentReady"
              @change="updateNotificationSetting('playSoundWhenAgentReady', $event)"
            />
          </SettingsField>
          <SettingsActionRow
            description="Use this to confirm that your selected alerts are working."
          >
            <SettingsButton type="button" @click="testAgentReadyNotification">
              Test notification
            </SettingsButton>
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
