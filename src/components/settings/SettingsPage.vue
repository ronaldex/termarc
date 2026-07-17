<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    kind: string;
    showEditIcon?: boolean;
  }>(),
  { showEditIcon: true },
);
</script>

<template>
  <section class="settings-page">
    <header class="page-header">
      <strong>{{ title }}</strong>
      <span v-if="showEditIcon" class="edit-icon" aria-hidden="true">⌁</span>
      <span class="page-kind">{{ kind }}</span>
    </header>
    <div class="page-content"><slot /></div>
  </section>
</template>

<style scoped>
.settings-page {
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
  font-size: 0.75rem;
}
.edit-icon {
  color: #8a8d95;
  font-size: 1rem;
  transform: rotate(-30deg);
}
.page-kind {
  padding-left: 14px;
  border-left: 1px solid #303238;
  color: var(--color-text-muted);
  font-size: 0.625rem;
}
.edit-icon + .page-kind {
  margin-left: 2px;
}
.page-content {
  width: min(760px, calc(100% - 44px));
  padding: 34px 0 48px;
  margin: 0 auto;
}
</style>
