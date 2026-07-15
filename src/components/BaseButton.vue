<script setup lang="ts">
withDefaults(defineProps<{ variant?: "secondary" | "danger" }>(), {
  variant: "secondary",
});
</script>

<template>
  <button class="button" :class="variant"><slot /></button>
</template>

<style scoped>
.button {
  padding: 6px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: #b8c0d2;
  background: #1a1e28;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: 120ms ease;
}

.button:hover:not(:disabled) {
  border-color: #41495d;
  color: #edf1f8;
  background: #222733;
}

.button:disabled {
  opacity: 0.45;
  cursor: default;
}

.button.danger {
  border-color: #4c2e36;
  color: #e3a0ad;
  background: #24171c;
}

.button.danger:hover:not(:disabled) {
  border-color: #6a3845;
  color: #ffc0cb;
  background: #311d23;
}
</style>
