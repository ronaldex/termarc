<script setup lang="ts">
import { ref } from "vue";
import { installCliSymlink } from "../api/cli";
import { useAppSettings } from "../composables/useAppSettings";
import {
  EXTERNAL_EDITOR_OPTIONS,
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

const { settings } = useAppSettings();
const cliStatus = ref<{ kind: "success" | "error"; message: string }>();
const installingCli = ref(false);

async function installCli(): Promise<void> {
  installingCli.value = true;
  cliStatus.value = undefined;
  try {
    const path = await installCliSymlink();
    cliStatus.value = { kind: "success", message: `Installed at ${path}` };
  } catch (error) {
    cliStatus.value = { kind: "error", message: String(error) };
  } finally {
    installingCli.value = false;
  }
}

function testAgentReadyNotification(): void {
  void sendAgentReadyNotification({
    body: "Termdeck notifications are working.",
    notification: settings.notifyWhenAgentReady,
    sound: settings.playSoundWhenAgentReady,
  });
}
</script>

<template>
  <SettingsPage title="Termdeck" kind="App settings">
    <form>
      <SettingsSection title="GENERAL">
        <SettingsCard>
          <SettingsField title="Color theme" description="The color theme used by Termdeck.">
            <select v-model="settings.colorTheme">
              <option v-for="theme in COLOR_THEME_OPTIONS" :key="theme.value" :value="theme.value">
                {{ theme.label }}
              </option>
            </select>
          </SettingsField>
          <SettingsField title="Editor" description="The editor used to open files from Termdeck.">
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
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="COMMAND LINE">
        <SettingsCard>
          <SettingsActionRow
            title="Termdeck CLI"
            description="Add a termdeck symlink to ~/.local/bin so you can launch and manage Termdeck from your shell."
          >
            <SettingsButton type="button" :disabled="installingCli" @click="installCli">
              {{ installingCli ? "Installing…" : "Add symlink" }}
            </SettingsButton>
          </SettingsActionRow>
          <p
            v-if="cliStatus"
            class="cli-status"
            :class="cliStatus.kind"
            :role="cliStatus.kind === 'error' ? 'alert' : 'status'"
          >
            {{ cliStatus.message }}
          </p>
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
            <input v-model="settings.notifyWhenAgentReady" type="checkbox" />
          </SettingsField>
          <SettingsField
            title="Agent ready sound"
            description="Play a sound whenever Pi finishes processing."
          >
            <input v-model="settings.playSoundWhenAgentReady" type="checkbox" />
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
.cli-status {
  margin: 0 0.75rem 0.75rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.625rem;
  overflow-wrap: anywhere;
}
.cli-status.success {
  color: var(--color-status-running);
  background: var(--color-success-bg);
}
.cli-status.error {
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
</style>
