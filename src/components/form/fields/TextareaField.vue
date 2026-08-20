<script setup lang="ts">
import FormField from "./FormField.vue";

defineOptions({ inheritAttrs: false });

defineProps<{
  modelValue?: string;
  label: string;
  description?: string;
  error?: string;
  id?: string;
}>();

defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <FormField
    :label="label"
    :description="description"
    :error="error"
    :control-id="id"
    v-slot="{ controlId, describedBy, invalid }"
  >
    <textarea
      v-bind="$attrs"
      :id="controlId"
      class="form-control"
      :value="modelValue ?? ''"
      :aria-describedby="describedBy"
      :aria-invalid="invalid || undefined"
      @input="$emit('update:modelValue', ($event.currentTarget as HTMLTextAreaElement).value)"
    ></textarea>
  </FormField>
</template>
