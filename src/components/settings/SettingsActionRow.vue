<script setup lang="ts">
defineProps<{ title?: string; description: string }>();
</script>

<template>
  <div class="action-row">
    <span class="copy">
      <strong v-if="title">{{ title }}</strong>
      <small>{{ description }}</small>
    </span>
    <slot />
  </div>
</template>

<style scoped>
.action-row {
  display: flex;
  min-height: 4rem;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
}
.copy strong,
.copy small {
  display: block;
}
.copy strong {
  margin-bottom: 0.25rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 500;
}
.copy small {
  color: var(--color-text-muted);
  font-size: 0.625rem;
  line-height: 1.35;
}
@media (max-width: 48rem) {
  .action-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
