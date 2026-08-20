<script setup lang="ts">
import AppButton from "../../ui/AppButton.vue";
import FormField from "./FormField.vue";

defineProps<{
  modelValue?: string;
  label: string;
  description?: string;
  placeholder?: string;
  readonly?: boolean;
  error?: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
  browse: [];
}>();
</script>

<template>
  <FormField
    :label="label"
    :description="description"
    :error="error"
    v-slot="{ controlId, describedBy, invalid }"
  >
    <div class="directory-field">
      <input
        :id="controlId"
        class="form-control"
        type="text"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :readonly="readonly"
        spellcheck="false"
        :aria-describedby="describedBy"
        :aria-invalid="invalid || undefined"
        @input="$emit('update:modelValue', ($event.currentTarget as HTMLInputElement).value)"
      />
      <AppButton type="button" @click="$emit('browse')">Browse…</AppButton>
    </div>
  </FormField>
</template>

<style scoped>
.directory-field {
  display: flex;
  gap: 0.5rem;
}
.directory-field input {
  flex: 1;
  min-width: 0;
}
</style>
