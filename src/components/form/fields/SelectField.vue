<script setup lang="ts" generic="T extends string | number">
import { computed } from "vue";
import FormField from "./FormField.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue: T;
  label: string;
  description?: string;
  error?: string;
  id?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const value = computed({
  get: () => props.modelValue,
  set: (next: T) => emit("update:modelValue", next),
});
</script>

<template>
  <FormField
    :label="label"
    :description="description"
    :error="error"
    :control-id="id"
    v-slot="{ controlId, describedBy, invalid }"
  >
    <select
      v-bind="$attrs"
      :id="controlId"
      v-model="value"
      class="form-control"
      :aria-describedby="describedBy"
      :aria-invalid="invalid || undefined"
    >
      <slot />
    </select>
  </FormField>
</template>
