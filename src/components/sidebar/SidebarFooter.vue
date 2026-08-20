<script setup lang="ts">
import SidebarChevron from "./SidebarChevron.vue";

defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ toggle: []; add: [] }>();

function toggle(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggle");
}
</script>

<template>
  <div v-if="collapsed" class="collapsed-footer">
    <SidebarChevron title="Show sidebar (⌘P)" @click="toggle" />
  </div>
  <div v-else class="sidebar-footer">
    <button class="add-project" @click="$emit('add')">＋ Add project</button>
    <SidebarChevron direction="left" title="Hide sidebar (⌘P)" @click="toggle" />
  </div>
</template>

<style scoped>
.sidebar-footer {
  display: flex;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem 0 1.125rem;
  border-top: 1px solid var(--line);
}
.add-project {
  padding: 0;
  border: 0;
  color: var(--color-text-subtle);
  background: transparent;
  font-size: 0.6875rem;
  cursor: pointer;
}
.add-project:hover {
  color: var(--color-text);
}
.collapsed-footer {
  display: flex;
  height: 2.5rem;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--line);
}
</style>
