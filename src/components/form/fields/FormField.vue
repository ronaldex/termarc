<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    description?: string;
    error?: string;
    controlId?: string;
    group?: boolean;
  }>(),
  { description: undefined, error: undefined, controlId: undefined, group: false },
);

const generatedId = useId();
const id = computed(() => props.controlId ?? generatedId);
const descriptionId = computed(() => (props.description ? `${id.value}-description` : undefined));
const errorId = computed(() => (props.error ? `${id.value}-error` : undefined));
const describedBy = computed(
  () => [descriptionId.value, errorId.value].filter(Boolean).join(" ") || undefined,
);
</script>

<template>
  <fieldset v-if="group" class="form-field">
    <legend class="field-legend">{{ label }}</legend>
    <div class="field-copy">
      <strong>{{ label }}</strong>
      <small v-if="description" :id="descriptionId">{{ description }}</small>
    </div>
    <div class="field-control">
      <slot :control-id="id" :described-by="describedBy" :invalid="Boolean(error)" />
      <small v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</small>
    </div>
  </fieldset>
  <div v-else class="form-field">
    <div class="field-copy">
      <label :for="id">{{ label }}</label>
      <small v-if="description" :id="descriptionId">{{ description }}</small>
    </div>
    <div class="field-control">
      <slot :control-id="id" :described-by="describedBy" :invalid="Boolean(error)" />
      <small v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</small>
    </div>
  </div>
</template>

<style scoped>
.form-field {
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
.field-legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  padding: 0;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.field-copy,
.field-copy label,
.field-copy small {
  display: block;
}
.field-copy label,
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
.field-control {
  min-width: 0;
}
.field-error {
  display: block;
  margin-top: 0.375rem;
  color: var(--color-status-error);
  font-size: 0.625rem;
}
@media (max-width: 48rem) {
  .form-field {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
}
</style>
