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
  min-height: 64px;
  grid-template-columns: minmax(190px, 1fr) minmax(250px, 330px);
  align-items: center;
  gap: 24px;
  padding: 12px 15px;
  border: 0;
  margin: 0;
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
.settings-field :deep(input:not([type="checkbox"])),
.settings-field :deep(textarea) {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid #3a3c42;
  border-radius: 6px;
  outline: none;
  color: #e4e5e8;
  background: #17181b;
  font: inherit;
  font-size: 11px;
}
.settings-field :deep(input:not([type="checkbox"])) {
  height: 31px;
}
.settings-field :deep(textarea) {
  min-height: 62px;
  padding-block: 8px;
  resize: vertical;
  line-height: 1.45;
}
.settings-field :deep(input:not([type="checkbox"]):focus),
.settings-field :deep(textarea:focus) {
  border-color: #61656f;
  box-shadow: 0 0 0 1px #61656f33;
}
.settings-field :deep(input[type="checkbox"]) {
  width: 16px;
  height: 16px;
  justify-self: start;
  accent-color: #7aa2f7;
}
@media (max-width: 760px) {
  .settings-field {
    grid-template-columns: 1fr;
    gap: 9px;
  }
}
</style>
