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
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 15px;
}
.copy strong,
.copy small {
  display: block;
}
.copy strong {
  margin-bottom: 3px;
  color: #e0e1e4;
  font-size: 0.75rem;
  font-weight: 500;
}
.copy small {
  color: #9699a1;
  font-size: 0.625rem;
  line-height: 1.35;
}
@media (max-width: 760px) {
  .action-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
