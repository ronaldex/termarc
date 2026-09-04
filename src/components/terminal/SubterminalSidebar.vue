<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TerminalTab } from "../../types/terminal";

const props = defineProps<{
  tabs: TerminalTab[];
  tabIds: string[];
  focusedTerminalId?: string;
  terminalContainerRef: (tab: TerminalTab, ownerId: string) => (element: Element | null) => void;
}>();
const emit = defineEmits<{
  focus: [tabId: string];
  maximize: [tabId: string];
  start: [tabId: string];
  layout: [];
}>();
const panel = ref<HTMLElement>();
const labelVisibleFor = ref<string>();
let labelHideTimer: ReturnType<typeof setTimeout> | undefined;
const visibleTabs = computed(() =>
  props.tabIds.flatMap((id) => {
    const tab = props.tabs.find((candidate) => candidate.id === id);
    return tab ? [tab] : [];
  }),
);
let observer: ResizeObserver | undefined;

function terminalLabel(tab: TerminalTab): string {
  if (tab.customTitle) return tab.customTitle;
  if (tab.launch.kind === "subagent" && tab.launch.name) return tab.launch.name;
  return tab.launchTitle || tab.terminalTitle || tab.title || `Terminal ${tab.number}`;
}
function paneLabel(tab: TerminalTab): string {
  const number = visibleTabs.value.findIndex((candidate) => candidate.id === tab.id) + 1;
  return tab.customTitle || `Terminal ${number}`;
}
function revealPaneLabel(tabId?: string): void {
  if (!tabId) return;
  labelVisibleFor.value = tabId;
  if (labelHideTimer) clearTimeout(labelHideTimer);
  labelHideTimer = setTimeout(() => {
    labelVisibleFor.value = undefined;
  }, 1500);
}
function scrollFocusedPane(): void {
  const focused =
    visibleTabs.value.find((tab) => tab.id === props.focusedTerminalId) ?? visibleTabs.value[0];
  panel.value
    ?.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(focused?.id ?? "")}"]`)
    ?.scrollIntoView({ block: "nearest" });
}
async function focusPanel(): Promise<void> {
  await nextTick();
  scrollFocusedPane();
  const focused =
    visibleTabs.value.find((tab) => tab.id === props.focusedTerminalId) ?? visibleTabs.value[0];
  if (focused?.status === "running" || focused?.status === "starting") focused.terminal?.focus();
  else
    panel.value
      ?.querySelector<HTMLElement>(
        `[data-pane-id="${CSS.escape(focused?.id ?? "")}"] .stopped-pane button`,
      )
      ?.focus();
}
function hasPanelFocus(): boolean {
  return panel.value?.contains(document.activeElement) ?? false;
}
defineExpose({ focusPanel, hasPanelFocus });

watch(() => props.focusedTerminalId, revealPaneLabel);
watch(
  [() => props.focusedTerminalId, () => props.tabIds.join(",")],
  () => void nextTick(scrollFocusedPane),
  { flush: "post", immediate: true },
);
watch(
  () => props.tabIds.join(","),
  () => void nextTick(() => emit("layout")),
  { flush: "post" },
);
onMounted(() => {
  if (!panel.value) return;
  observer = new ResizeObserver(() => emit("layout"));
  observer.observe(panel.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (labelHideTimer) clearTimeout(labelHideTimer);
});
</script>

<template>
  <div ref="panel" class="subterminal-sidebar" tabindex="-1" aria-label="Subterminals">
    <section
      v-for="tab in visibleTabs"
      :key="tab.id"
      class="subterminal-pane"
      :class="{ 'fills-sidebar': visibleTabs.length < 3 }"
      :data-pane-id="tab.id"
      @focusin="emit('focus', tab.id)"
      @pointerdown="emit('focus', tab.id)"
    >
      <span v-if="labelVisibleFor === tab.id" class="terminal-pane-label" aria-hidden="true">
        {{ paneLabel(tab) }}
      </span>
      <button
        class="maximize-button"
        type="button"
        :aria-label="`Show ${terminalLabel(tab)} as main terminal`"
        title="Show as main terminal"
        @click.stop="emit('maximize', tab.id)"
      >
        ↗
      </button>
      <div v-if="tab.launch.kind === 'shell' && tab.status === 'stopped'" class="stopped-pane">
        <span>Terminal is stopped</span>
        <button type="button" @click="emit('start', tab.id)">Start terminal</button>
      </div>
      <div
        v-else
        class="terminal-target"
        :ref="props.terminalContainerRef(tab, `sidebar:${tab.id}`)"
      />
    </section>
  </div>
</template>

<style scoped>
.subterminal-sidebar {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow: auto;
  scrollbar-width: none;
  background: var(--color-app-bg);
}
.subterminal-sidebar::-webkit-scrollbar {
  display: none;
}
.subterminal-pane {
  position: relative;
  display: flex;
  box-sizing: border-box;
  min-height: 0;
  flex: 0 0 calc(100% / 3);
  flex-direction: column;
  overflow: hidden;
  padding: var(--terminal-surface-padding, 0.375rem);
  background: var(--color-app-bg);
}
.subterminal-pane.fills-sidebar {
  flex: 1 1 0;
}
.subterminal-pane + .subterminal-pane {
  border-top: 1px solid var(--color-border-muted);
}
.terminal-pane-label {
  position: absolute;
  z-index: 5;
  right: 0.5rem;
  bottom: 0.375rem;
  max-width: calc(100% - 1rem);
  overflow: hidden;
  padding: 0.125rem 0.25rem;
  border-radius: 0.1875rem;
  color: var(--color-text-subtle);
  background: color-mix(in srgb, var(--color-app-bg) 75%, transparent);
  font-size: 0.625rem;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.subterminal-pane::before,
.subterminal-pane::after {
  position: absolute;
  z-index: 4;
  right: 0;
  left: 0;
  height: 0.125rem;
  background: var(--color-focus);
  content: "";
  opacity: 0;
  pointer-events: none;
}
.subterminal-pane::before {
  top: 0;
}
.subterminal-pane::after {
  bottom: 0;
}
.subterminal-pane:focus-within::before,
.subterminal-pane:focus-within::after {
  opacity: 1;
}
.maximize-button {
  position: absolute;
  z-index: 5;
  top: 0.375rem;
  right: 0.5rem;
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: 0.25rem;
  place-items: center;
  color: var(--color-text-subtle);
  background: color-mix(in srgb, var(--color-app-bg) 85%, transparent);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.subterminal-pane:hover .maximize-button {
  opacity: 0.75;
  pointer-events: auto;
  visibility: visible;
}
.maximize-button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
  opacity: 1;
}
.terminal-target,
.terminal-target :deep(.terminal-runtime-root),
.terminal-target :deep(.xterm) {
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.terminal-target {
  flex: 1;
  overflow: hidden;
  background: var(--color-app-bg);
}
.terminal-target :deep(.xterm-viewport) {
  background-color: var(--color-app-bg) !important;
}
.stopped-pane {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  color: var(--color-text-subtle);
  background: var(--color-app-bg);
  font-size: 0.6875rem;
}
.stopped-pane button {
  height: 1.75rem;
  padding: 0 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
</style>
