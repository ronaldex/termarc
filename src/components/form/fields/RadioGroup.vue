<script setup lang="ts" generic="T extends string">
import { useId } from "vue";
import FormField from "./FormField.vue";

const props = defineProps<{
  modelValue: T;
  label: string;
  description?: string;
  options: readonly {
    value: T;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  name?: string;
  disabled?: boolean;
  error?: string;
}>();

defineEmits<{ "update:modelValue": [value: T] }>();

const generatedName = useId();
</script>

<template>
  <FormField
    :label="label"
    :description="description"
    :error="error"
    group
    v-slot="{ controlId, describedBy, invalid }"
  >
    <div class="radio-options">
      <label
        v-for="(option, index) in options"
        :key="option.value"
        class="radio-option"
        :class="{ selected: modelValue === option.value, disabled: disabled || option.disabled }"
        :for="`${controlId}-${index}`"
      >
        <input
          :id="`${controlId}-${index}`"
          type="radio"
          :name="name ?? generatedName"
          :value="option.value"
          :checked="modelValue === option.value"
          :disabled="disabled || option.disabled"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          @change="$emit('update:modelValue', option.value)"
        />
        <span>
          <strong>{{ option.label }}</strong>
          <small v-if="option.description">{{ option.description }}</small>
        </span>
      </label>
    </div>
  </FormField>
</template>

<style scoped>
.radio-options {
  display: grid;
  gap: 0.5rem;
}
.radio-option {
  display: flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-raised);
  cursor: pointer;
}
.radio-option:hover:not(.disabled) {
  background: var(--color-surface-active);
}
.radio-option.selected {
  border-color: var(--color-text-faint);
}
.radio-option.disabled {
  cursor: default;
  opacity: 0.45;
}
.radio-option input {
  accent-color: var(--color-accent);
}
.radio-option strong,
.radio-option small {
  display: block;
}
.radio-option strong {
  margin-bottom: 0.125rem;
  font-size: 0.6875rem;
  font-weight: 500;
}
.radio-option small {
  color: var(--color-text-subtle);
  font-size: 0.5625rem;
}
</style>
