<script setup lang="ts">
import { useAppSettings } from "../composables/useAppSettings";
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
      <SettingsSection title="TERMINAL">
        <SettingsCard>
          <SettingsField title="Font family" description="The font family used for the terminal.">
            <input v-model="settings.terminalFontFamily" required spellcheck="false" />
          </SettingsField>
          <SettingsField title="Font size" description="The font size in pixels.">
            <input
              v-model.number="settings.terminalFontSize"
              type="number"
              min="8"
              max="72"
              required
            />
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
