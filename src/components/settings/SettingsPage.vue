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
  background: var(--color-surface-0);
}
.page-header {
  display: flex;
  height: 2.5rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-0);
}
.page-header strong {
  color: var(--color-text-strong);
  font-size: 0.75rem;
}
.edit-icon {
  color: var(--color-text-muted);
  font-size: 1rem;
  transform: rotate(-30deg);
}
.page-kind {
  padding-left: 0.875rem;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.625rem;
}
.edit-icon + .page-kind {
  margin-left: 0.125rem;
}
.page-content {
  width: min(48rem, calc(100% - 2.75rem));
  padding: 2.25rem 0 3rem;
  margin: 0 auto;
}
</style>
