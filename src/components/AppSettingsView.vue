<script setup lang="ts">
import { useAppSettings } from "../composables/useAppSettings";

const { settings } = useAppSettings();
</script>

<template>
  <section class="settings-view">
    <header class="page-header">
      <strong>Termdeck</strong>
      <span class="edit-icon" aria-hidden="true">⌁</span>
      <span class="page-kind">App settings</span>
    </header>

    <div class="page-content">
      <span class="section-label">TERMINAL</span>
      <form>
        <div class="settings-card">
          <label>
            <span class="field-copy"
              ><strong>Font family</strong
              ><small>The font family used for the terminal.</small></span
            >
            <input v-model="settings.terminalFontFamily" required spellcheck="false" />
          </label>
          <label>
            <span class="field-copy"
              ><strong>Font size</strong><small>The font size in pixels.</small></span
            >
            <input
              type="number"
              min="8"
              max="72"
              v-model.number="settings.terminalFontSize"
              required
            />
          </label>
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
.settings-card {
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
.field-copy small {
  display: block;
}
.field-copy strong {
  margin-bottom: 3px;
  color: #e0e1e4;
  font-size: 12px;
  font-weight: 500;
}
.field-copy small {
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
@media (max-width: 760px) {
  .settings-card label {
    grid-template-columns: 1fr;
    gap: 9px;
  }
}
</style>
