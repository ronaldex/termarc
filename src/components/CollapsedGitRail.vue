<script setup lang="ts">
import { computed } from "vue";
import type { DiffData } from "../utils/gitDiff";
import { summarizeGitDiff } from "../utils/gitDiff";
import OverlayScrollArea from "./OverlayScrollArea.vue";

const props = defineProps<{
  files: DiffData[];
  loading: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  preview: [];
  expand: [];
  reveal: [path: string];
}>();

const summary = computed(() => summarizeGitDiff(props.files));
const summaryLabel = computed(() => {
  if (props.error) return `Git changes unavailable: ${props.error}`;
  if (props.loading && !summary.value.files) return "Refreshing Git changes";
  if (!summary.value.files) return "Git working tree is clean";
  return `${summary.value.files} changed ${summary.value.files === 1 ? "file" : "files"}, ${summary.value.additions} additions, ${summary.value.deletions} deletions`;
});

function statusLabel(file: DiffData): string {
  return `${file.status}: ${file.path}, ${file.additions} additions, ${file.deletions} deletions`;
}
</script>

<template>
  <div class="git-rail">
    <button
      class="git-summary"
      type="button"
      :title="summaryLabel"
      :aria-label="`${summaryLabel}. Show Git changes`"
      aria-live="polite"
      @click="emit('preview')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="4" cy="3" r="1.5" />
        <circle cx="12" cy="5" r="1.5" />
        <circle cx="4" cy="13" r="1.5" />
        <path d="M4 4.5v7M5.5 6.5h3A3.5 3.5 0 0 0 12 3" />
      </svg>
      <span v-if="summary.files" class="file-count">{{ summary.files }}</span>
      <span v-else-if="error" class="state-mark error">!</span>
      <span v-else-if="loading" class="state-mark loading">…</span>
      <span v-else class="state-mark clean">✓</span>
    </button>

    <div v-if="summary.files" class="line-summary" :title="summaryLabel" aria-hidden="true">
      <span class="additions">+{{ summary.additions }}</span>
      <span class="deletions">−{{ summary.deletions }}</span>
    </div>

    <OverlayScrollArea v-if="files.length" class="git-file-scroll">
      <div class="git-files" aria-label="Changed files">
        <button
          v-for="file in files"
          :key="file.key"
          class="git-file"
          :class="file.status"
          type="button"
          :title="statusLabel(file)"
          :aria-label="statusLabel(file)"
          @click="emit('reveal', file.path)"
        >
          {{ file.status.charAt(0).toUpperCase() }}
        </button>
      </div>
    </OverlayScrollArea>

    <footer class="git-rail-footer">
      <button
        type="button"
        title="Show Git changes"
        aria-label="Show Git changes"
        @click="emit('expand')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.git-rail {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  align-items: center;
}
button {
  display: grid;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
.git-summary {
  position: relative;
  width: 2rem;
  height: 2rem;
  flex: 0 0 2rem;
  margin: 0.5rem 0 0.25rem;
  border-radius: 0.375rem;
}
.git-summary svg,
.git-rail-footer svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.4;
}
.file-count,
.state-mark {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  min-width: 0.875rem;
  height: 0.875rem;
  padding: 0 0.1875rem;
  border-radius: 0.4375rem;
  color: var(--color-text-strong);
  background: var(--color-surface-emphasis);
  font-size: 0.5rem;
  line-height: 0.875rem;
}
.state-mark.clean {
  color: var(--color-status-running);
  background: var(--color-success-bg);
}
.state-mark.error {
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
.state-mark.loading {
  color: var(--color-accent-hover);
  background: var(--color-accent-bg);
}
.line-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.0625rem;
  padding-bottom: 0.375rem;
  font-family: "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5rem;
}
.additions {
  color: var(--color-status-running);
}
.deletions {
  color: var(--color-status-error);
}
.git-file-scroll {
  width: 100%;
  min-height: 0;
  flex: 1;
}
.git-files {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0;
  border-top: 1px solid var(--color-border-muted);
}
.git-file {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-text-muted) 8%, transparent);
  font-family: "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5rem;
  font-weight: 700;
}
.git-file.added {
  color: var(--color-status-running);
  background: color-mix(in srgb, var(--color-status-running) 8%, transparent);
}
.git-file.deleted {
  color: var(--color-status-error);
  background: color-mix(in srgb, var(--color-status-error) 8%, transparent);
}
.git-file.renamed {
  color: var(--color-accent-hover);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}
.git-rail-footer {
  display: flex;
  width: 100%;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  border-top: 1px solid var(--color-border);
}
.git-rail-footer button {
  width: 1.25rem;
  height: 1.75rem;
  border-radius: 0.25rem;
}
</style>
