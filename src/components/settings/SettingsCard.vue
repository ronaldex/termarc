<template>
  <div class="settings-card"><slot /></div>
</template>

<style scoped>
.settings-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
  background: var(--color-surface-base);
}
.settings-card :deep(> * + *) {
  border-top: 1px solid var(--color-border);
}
</style>
