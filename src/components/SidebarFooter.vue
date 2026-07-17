<script setup lang="ts">
import SidebarChevron from "./SidebarChevron.vue";

defineProps<{ collapsed?: boolean }>();
defineEmits<{ toggle: []; add: [] }>();
</script>

<template>
  <div v-if="collapsed" class="collapsed-footer">
    <SidebarChevron title="Show sidebar" @click="$emit('toggle')" />
  </div>
  <div v-else class="sidebar-footer">
    <button class="add-project" @click="$emit('add')">＋ Add project</button>
    <SidebarChevron direction="left" title="Hide sidebar" @click="$emit('toggle')" />
  </div>
</template>

<style scoped>
.sidebar-footer {
  display: flex;
  height: 38px;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 11px 0 17px;
  border-top: 1px solid var(--line);
}
.add-project {
  padding: 0;
  border: 0;
  color: #696c73;
  background: transparent;
  font-size: 0.6875rem;
  cursor: pointer;
}
.add-project:hover {
  color: #c6c8cc;
}
.collapsed-footer {
  display: flex;
  height: 38px;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--line);
}
</style>
