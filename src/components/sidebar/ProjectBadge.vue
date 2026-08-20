<script setup lang="ts">
import { computed } from "vue";
import { projectInitials } from "../../utils/projectInitials";

const props = defineProps<{ name: string }>();
const initials = computed(() => projectInitials(props.name));
</script>

<template>
  <span class="project-badge" aria-hidden="true">{{ initials }}</span>
</template>

<style scoped>
.project-badge {
  display: grid;
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 1.25rem;
  place-items: center;
  border-radius: 0.25rem;
  color: var(--color-text);
  background: var(--color-surface-emphasis);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
