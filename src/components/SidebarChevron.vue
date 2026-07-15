<script setup lang="ts">
defineProps<{
  direction?: "left" | "right";
  open?: boolean;
  title: string;
}>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="sidebar-chevron"
    :class="{ open, left: direction === 'left' }"
    :title="title"
    @click="$emit('click', $event)"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
  </button>
</template>

<style scoped>
.sidebar-chevron {
  display: grid;
  width: 18px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  place-items: center;
  color: #696c73;
  background: transparent;
  cursor: pointer;
}
.sidebar-chevron:hover {
  color: #c6c8cc;
}
.sidebar-chevron svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  transition: transform 120ms ease;
}
.sidebar-chevron.open svg {
  transform: rotate(90deg);
}
.sidebar-chevron.left svg {
  transform: rotate(180deg);
}
</style>
