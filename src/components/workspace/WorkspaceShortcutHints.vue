<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { RightSidebarMode } from "../../types/rightSidebar";
import type { SidebarSelection } from "../../types/sidebar";
import type { WorkspaceFocusRegion } from "../../utils/workspaceShortcut";
import { workspaceShortcutHints } from "../../utils/workspaceShortcutHints";

const props = defineProps<{
  selection: SidebarSelection;
  shortcutModifier: "meta" | "ctrl";
  rightSidebarAvailable: boolean;
  rightSidebarMode?: RightSidebarMode;
  rightSidebarModes: RightSidebarMode[];
}>();

const focusRegion = ref<WorkspaceFocusRegion>("other");
const terminalFocused = ref(false);

function updateFocus(): void {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) {
    focusRegion.value = "other";
    terminalFocused.value = false;
    return;
  }
  terminalFocused.value = Boolean(element.closest(".terminal-shell, .terminal-target"));
  if (element.closest(".sidebar")) focusRegion.value = "left-sidebar";
  else if (element.closest(".right-sidebar")) focusRegion.value = "right-sidebar";
  else if (element.closest(".main-panel")) focusRegion.value = "workspace";
  else focusRegion.value = "other";
}

const hints = computed(() =>
  workspaceShortcutHints({
    focusRegion: focusRegion.value,
    selection: props.selection,
    terminalFocused: terminalFocused.value,
    rightSidebarAvailable: props.rightSidebarAvailable,
    rightSidebarMode: props.rightSidebarMode,
    rightSidebarHasPreviousMode:
      props.rightSidebarModes.indexOf(props.rightSidebarMode ?? "subterminals") > 0,
    rightSidebarHasNextMode:
      props.rightSidebarModes.indexOf(props.rightSidebarMode ?? "subterminals") <
      props.rightSidebarModes.length - 1,
  }),
);
const modifier = computed(() => (props.shortcutModifier === "meta" ? "⌘" : "Ctrl"));
function displayKeys(keys: string): string {
  return keys.replaceAll("⌘", modifier.value);
}

onMounted(() => {
  updateFocus();
  window.addEventListener("focusin", updateFocus);
});
onBeforeUnmount(() => window.removeEventListener("focusin", updateFocus));
</script>

<template>
  <footer class="workspace-footer" aria-label="Keyboard shortcut hints">
    <div class="shortcut-hints">
      <span v-for="hint in hints" :key="hint.label" class="shortcut-hint">
        <kbd>{{ displayKeys(hint.keys) }}</kbd>
        <span>{{ hint.label }}</span>
      </span>
    </div>
  </footer>
</template>

<style scoped>
.workspace-footer {
  display: flex;
  min-width: 0;
  grid-column: 1;
  grid-row: 2;
  align-items: center;
  gap: 1rem;
  padding: 0 0.875rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-subtle);
  background: var(--panel-footer-background);
  overflow: hidden;
}
.shortcut-hints {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 1rem;
  overflow: hidden;
}
.shortcut-hint {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
  font-size: 0.6875rem;
}
kbd {
  padding: 0.125rem 0.3rem;
  border: 0;
  border-radius: 0.25rem;
  outline: 1px solid var(--color-border-strong);
  outline-offset: -1px;
  color: var(--color-text-subtle);
  background: transparent;
  font-family: inherit;
  font-size: 0.625rem;
  line-height: 1.2;
}
@media (max-width: 48rem) {
  .workspace-footer {
    gap: 0.625rem;
    padding: 0 0.625rem;
  }
  .shortcut-hints {
    gap: 0.75rem;
  }
}
</style>
