<script setup lang="ts">
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
</style>
