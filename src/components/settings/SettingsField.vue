<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description: string;
    group?: boolean;
  }>(),
  { group: false },
);
</script>

<template>
  <component :is="group ? 'fieldset' : 'label'" class="settings-field">
    <span class="field-copy">
      <strong>{{ title }}</strong>
      <small>{{ description }}</small>
    </span>
    <slot />
  </component>
</template>

<style scoped>
.settings-field {
  display: grid;
  min-width: 0;
  min-height: 4rem;
  grid-template-columns: minmax(12rem, 1fr) minmax(16rem, 21rem);
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  border: 0;
  margin: 0;
}
.field-copy strong,
.field-copy small {
  display: block;
}
.field-copy strong {
  margin-bottom: 0.25rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 500;
}
.field-copy small {
  color: var(--color-text-muted);
  font-size: 0.625rem;
  line-height: 1.35;
}
.settings-field :deep(input:not([type="checkbox"])),
.settings-field :deep(select),
.settings-field :deep(textarea) {
  width: 100%;
  min-width: 0;
  padding: 0 0.625rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text-strong);
  background: var(--color-surface-raised);
  font: inherit;
  font-size: 0.6875rem;
}
.settings-field :deep(input:not([type="checkbox"])),
.settings-field :deep(select) {
  height: 2rem;
}
.settings-field :deep(textarea) {
  min-height: 4rem;
  padding-block: 0.5rem;
  resize: vertical;
  line-height: 1.45;
}
.settings-field :deep(input:not([type="checkbox"]):focus),
.settings-field :deep(select:focus),
.settings-field :deep(textarea:focus) {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-focus) 35%, transparent);
}
@media (max-width: 48rem) {
  .settings-field {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
}
</style>
