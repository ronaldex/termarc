<script setup lang="ts">
import "@git-diff-view/vue/styles/diff-view-pure.css";
import { defineAsyncComponent } from "vue";
import { useGitDiffKeyboardNavigation } from "../composables/useGitDiffKeyboardNavigation";
import type { DiffData } from "../utils/gitDiff";

const AsyncDiffView = defineAsyncComponent(() =>
  import("@git-diff-view/vue").then(({ DiffView }) => DiffView),
);

const props = defineProps<{
  files: DiffData[];
  error?: string;
  repository?: string;
  loading: boolean;
  fontSize: number;
  diffTheme: "light" | "dark";
  expandedFiles: Set<string>;
  allFilesExpanded: boolean;
  editorName: string;
}>();

const emit = defineEmits<{
  collapse: [];
  refresh: [];
  toggleFile: [key: string];
  toggleAll: [];
  openFile: [path: string];
}>();

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator + 1);
}

const {
  rootElement,
  diffContentElement,
  activeFileKey,
  focusedDiffKey,
  setFileButton,
  setFileDiff,
  focusActiveFile,
  handleKeydown,
} = useGitDiffKeyboardNavigation({
  fileKeys: () => props.files.map((file) => file.key),
  expandedKeys: () => props.expandedFiles,
  fontSize: () => props.fontSize,
  toggleFile: (key) => emit("toggleFile", key),
});

defineExpose({ focusActiveFile });
</script>

<template>
  <div ref="rootElement" class="expanded-git-diff" tabindex="-1" @keydown="handleKeydown">
    <div v-if="error" class="diff-message error">{{ error }}</div>
    <div v-else-if="!repository" class="diff-message">
      No Git repository in this terminal directory.
    </div>
    <div v-else-if="!files.length" class="diff-message">Working tree is clean.</div>
    <template v-else>
      <div class="files-toolbar">
        <span>{{ files.length }} changed {{ files.length === 1 ? "file" : "files" }}</span>
        <button type="button" @click="emit('toggleAll')">
          {{ allFilesExpanded ? "Collapse all" : "Expand all" }}
        </button>
      </div>
      <div ref="diffContentElement" class="diff-content">
        <section
          v-for="file in files"
          :key="file.key"
          class="file-change"
          :class="{
            'keyboard-active': activeFileKey === file.key,
            'diff-content-focused': focusedDiffKey === file.key,
          }"
          :data-diff-file-key="file.key"
          @focusin="activeFileKey = file.key"
        >
          <div class="file-header">
            <button
              :ref="(element) => setFileButton(element, file.key)"
              class="file-toggle"
              type="button"
              :aria-expanded="expandedFiles.has(file.key)"
              :title="file.path"
              @click="emit('toggleFile', file.key)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
              <span class="file-status" :class="file.status" :title="file.status">
                {{ file.status.charAt(0).toUpperCase() }}
              </span>
              <span class="file-name">
                <span class="file-parent">{{ parentPath(file.path) }}</span
                >{{ baseName(file.path) }}
              </span>
              <span class="line-counts" aria-label="Line changes">
                <span class="additions">+{{ file.additions }}</span>
                <span class="deletions">−{{ file.deletions }}</span>
              </span>
            </button>
            <button
              v-if="file.status !== 'deleted'"
              class="file-open"
              type="button"
              :title="`Open ${file.path} in ${editorName}`"
              :aria-label="`Open ${file.path} in ${editorName}`"
              @click="emit('openFile', file.path)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9 3h4v4M13 3 7.5 8.5M12 9v3H4V4h3" />
              </svg>
            </button>
          </div>
          <div
            v-if="expandedFiles.has(file.key)"
            :ref="(element) => setFileDiff(element, file.key)"
            class="file-diff"
            tabindex="0"
            :aria-label="`Changes in ${file.path}`"
            @focus="focusedDiffKey = file.key"
            @blur="focusedDiffKey = undefined"
          >
            <AsyncDiffView
              :data="file"
              :diff-view-mode="4"
              :diff-view-theme="diffTheme"
              :diff-view-highlight="true"
              :diff-view-wrap="true"
              :diff-view-font-size="fontSize * (10 / 13)"
            />
          </div>
        </section>
      </div>
    </template>
    <footer class="diff-footer">
      <button type="button" title="Hide Git changes" @click="emit('collapse')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
      </button>
      <button
        class="refresh-button"
        type="button"
        title="Refresh diff"
        aria-label="Refresh Git changes"
        :class="{ loading }"
        @click="emit('refresh')"
      >
        ↻
      </button>
    </footer>
  </div>
</template>

<style scoped>
.expanded-git-diff {
  --diff-line-number-gutter: 90px;
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}
.diff-message {
  padding: 1.125rem 0.875rem;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.5;
}
.expanded-git-diff:focus-visible > .diff-message {
  box-shadow: inset 0.25rem 0 var(--color-focus);
}
.diff-message.error {
  color: var(--color-status-error);
}
.files-toolbar {
  display: flex;
  height: 2rem;
  flex: 0 0 2rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.875rem;
  border-bottom: 1px solid var(--color-border-muted);
  color: var(--color-text-subtle);
  font-size: 0.625rem;
}
.files-toolbar button {
  padding: 0.25rem 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.files-toolbar button:hover {
  color: var(--color-text-strong);
}
.diff-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.file-change {
  border-bottom: 1px solid var(--color-border-muted);
}
.file-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  height: 2.25rem;
  background: var(--color-surface-raised);
}
.file-header:hover {
  background: var(--color-surface-hover);
}
.file-change.diff-content-focused .file-header::after {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: var(--diff-line-number-gutter);
  height: 0.125rem;
  background: var(--color-focus);
  content: "";
  pointer-events: none;
}
.expanded-git-diff:focus-within .file-change.keyboard-active .file-header::before {
  position: absolute;
  z-index: 1;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0;
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.file-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.25rem 0 0.625rem;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.file-toggle > svg {
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 0.75rem;
  fill: none;
  stroke: var(--color-text-subtle);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  transition: transform 120ms ease;
}
.file-toggle[aria-expanded="true"] > svg {
  transform: rotate(90deg);
}
.file-status {
  display: grid;
  width: 1.125rem;
  height: 1.125rem;
  flex: 0 0 1.125rem;
  place-items: center;
  border-radius: 0.25rem;
  color: var(--color-text-muted);
  background: var(--color-surface-emphasis);
  font-family: "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5625rem;
  font-weight: 700;
}
.file-status.added {
  color: var(--color-status-running);
  background: var(--color-success-bg);
}
.file-status.deleted {
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
.file-status.renamed {
  color: var(--color-accent-hover);
  background: var(--color-accent-bg);
}
.file-name {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  font-family: "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.625rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-parent {
  color: var(--color-text-subtle);
}
.line-counts {
  display: flex;
  flex: 0 0 auto;
  gap: 0.375rem;
  font-family: "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5625rem;
}
.additions {
  color: var(--color-status-running);
}
.deletions {
  color: var(--color-status-error);
}
.file-open {
  display: grid;
  width: 2rem;
  flex: 0 0 2rem;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
.file-open:hover {
  color: var(--color-text-strong);
}
.file-open svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.4;
}
.file-diff {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--color-border-muted);
}
.file-change.diff-content-focused .file-diff::after {
  position: absolute;
  z-index: 30;
  right: 0;
  bottom: 0;
  left: var(--diff-line-number-gutter);
  height: 0.125rem;
  background: var(--color-focus);
  content: "";
  pointer-events: none;
}
.file-diff :deep(.git-diff-view) {
  border: 0;
  border-radius: 0;
}
.file-diff :deep(.diff-style-root) {
  --diff-border--: var(--color-border);
  --diff-add-content--: color-mix(in srgb, var(--color-status-running) 14%, var(--color-app-bg));
  --diff-del-content--: color-mix(in srgb, var(--color-status-error) 14%, var(--color-app-bg));
  --diff-add-lineNumber--: color-mix(in srgb, var(--color-status-running) 24%, var(--color-app-bg));
  --diff-del-lineNumber--: color-mix(in srgb, var(--color-status-error) 24%, var(--color-app-bg));
  --diff-plain-content--: var(--color-app-bg);
  --diff-expand-content--: var(--color-surface-raised);
  --diff-plain-lineNumber--: var(--color-surface-raised);
  --diff-expand-lineNumber--: var(--color-surface-raised);
  --diff-plain-lineNumber-color--: var(--color-text-subtle);
  --diff-expand-lineNumber-color--: var(--color-text-subtle);
  --diff-hunk-content--: color-mix(in srgb, var(--color-accent) 12%, var(--color-app-bg));
  --diff-hunk-lineNumber--: color-mix(in srgb, var(--color-accent) 22%, var(--color-app-bg));
  --diff-hunk-lineNumber-hover--: var(--color-accent);
  --diff-add-content-highlight--: color-mix(
    in srgb,
    var(--color-status-running) 32%,
    var(--color-app-bg)
  );
  --diff-del-content-highlight--: color-mix(
    in srgb,
    var(--color-status-error) 32%,
    var(--color-app-bg)
  );
  --diff-add-widget--: var(--color-accent);
  --diff-add-widget-color--: var(--color-app-bg);
  --diff-empty-content--: var(--color-surface-raised);
  --diff-hunk-content-color--: var(--color-text-muted);
}
.diff-footer {
  display: flex;
  height: 2.5rem;
  flex: 0 0 2.5rem;
  align-items: center;
  margin-top: auto;
  padding: 0 0.75rem;
  border-top: 1px solid var(--color-border);
}
.diff-footer button {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 0;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
.diff-footer button:hover {
  color: var(--color-text);
}
.refresh-button {
  margin-left: auto;
}
.diff-footer button.loading {
  animation: spin 0.8s linear infinite;
}
.diff-footer svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
