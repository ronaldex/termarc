<script setup lang="ts">
import FormField from "./FormField.vue";

defineProps<{
  modelValue: boolean;
  label: string;
  description?: string;
  controlLabel?: string;
  controlDescription?: string;
  disabled?: boolean;
  error?: string;
}>();

defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <FormField
    :label="label"
    :description="description"
    :error="error"
    v-slot="{ controlId, describedBy, invalid }"
  >
    <component
      :is="controlLabel ? 'label' : 'div'"
      class="toggle-option"
      :class="{ detailed: controlLabel }"
      :for="controlLabel ? controlId : undefined"
    >
      <input
        :id="controlId"
        class="toggle-control"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        :aria-describedby="describedBy"
        :aria-invalid="invalid || undefined"
        @change="$emit('update:modelValue', ($event.currentTarget as HTMLInputElement).checked)"
      />
      <span v-if="controlLabel" class="toggle-copy">
        <strong>{{ controlLabel }}</strong>
        <small v-if="controlDescription">{{ controlDescription }}</small>
      </span>
    </component>
  </FormField>
</template>

<style scoped>
.toggle-option {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
}
.toggle-control {
  --toggle-width: 2rem;
  --toggle-height: 1.125rem;
  --toggle-padding: 0.125rem;
  position: relative;
  width: var(--toggle-width);
  height: var(--toggle-height);
  flex: 0 0 auto;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--toggle-height);
  appearance: none;
  background: var(--color-surface-emphasis);
  cursor: pointer;
  transition: 120ms ease;
}
.toggle-control::after {
  position: absolute;
  top: var(--toggle-padding);
  left: var(--toggle-padding);
  width: calc(var(--toggle-height) - var(--toggle-padding) * 2 - 2px);
  height: calc(var(--toggle-height) - var(--toggle-padding) * 2 - 2px);
  border-radius: 50%;
  background: var(--color-text-muted);
  content: "";
  transition: 120ms ease;
}
.toggle-control:checked {
  border-color: var(--color-accent);
  background: var(--color-accent);
}
.toggle-control:checked::after {
  background: var(--color-app-bg);
  transform: translateX(calc(var(--toggle-width) - var(--toggle-height)));
}
.toggle-control:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.toggle-control:disabled {
  cursor: default;
  opacity: 0.45;
}
.toggle-copy {
  display: grid;
  gap: 0.125rem;
}
.toggle-copy strong {
  color: var(--color-text-strong);
  font-size: 0.6875rem;
  font-weight: 500;
}
.toggle-copy small {
  color: var(--color-text-subtle);
  font-size: 0.5625rem;
}
</style>
