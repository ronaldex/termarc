<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

const props = defineProps<{
  x: number;
  y: number;
  label: string;
  items: ContextMenuItem[];
}>();
const emit = defineEmits<{
  select: [id: string];
  dismiss: [];
}>();

const menu = ref<HTMLElement>();
const position = ref({ left: props.x, top: props.y });

async function positionMenu(): Promise<void> {
  await nextTick();
  const element = menu.value;
  if (!element) return;
  const margin = 8;
  position.value = {
    left: Math.max(margin, Math.min(props.x, window.innerWidth - element.offsetWidth - margin)),
    top: Math.max(margin, Math.min(props.y, window.innerHeight - element.offsetHeight - margin)),
  };
}

function moveFocus(direction: -1 | 1): void {
  const buttons = [
    ...(menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
  ];
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = (current + direction + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("dismiss");
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveFocus(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const buttons = menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    buttons?.[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
  }
}

watch(() => [props.x, props.y, props.items], positionMenu, { flush: "post", deep: true });
onMounted(async () => {
  await positionMenu();
  menu.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="workspace-context-menu"
      role="menu"
      :aria-label="label"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @contextmenu.prevent.stop
      @keydown="handleKeydown"
    >
      <template v-for="item in items" :key="item.id">
        <span v-if="item.separatorBefore" class="separator" role="separator"></span>
        <button
          type="button"
          role="menuitem"
          :class="{ danger: item.danger }"
          :disabled="item.disabled"
          @click="emit('select', item.id)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-context-menu {
  position: fixed;
  z-index: 1000;
  display: flex;
  width: max-content;
  min-width: 11rem;
  flex-direction: column;
  padding: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--color-border-strong) 75%, transparent);
  border-radius: 0.75rem;
  box-shadow:
    0 1px 2px rgb(0 0 0 / 14%),
    0 0.75rem 1.875rem rgb(0 0 0 / 28%);
  background: color-mix(in srgb, var(--color-surface-active) 88%, transparent);
  backdrop-filter: blur(18px) saturate(160%);
  font: inherit;
  user-select: none;
}
button {
  height: 2rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 0.5rem;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
button:hover:not(:disabled),
button:focus-visible:not(:disabled) {
  color: var(--color-text-strong);
  background: color-mix(in srgb, var(--color-surface-hover) 85%, transparent);
}
button.danger {
  color: var(--color-status-error);
}
button:disabled {
  color: var(--color-text-faint);
  cursor: default;
}
.separator {
  height: 1px;
  margin: 0.35rem 0.5rem;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}
</style>
