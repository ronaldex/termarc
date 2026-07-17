<script setup lang="ts">
import "@git-diff-view/vue/styles/diff-view-pure.css";
import { computed, defineAsyncComponent, ref, toRef, watch } from "vue";
import { useGitDiff } from "../composables/useGitDiff";
import { splitGitDiff } from "../utils/gitDiff";

const AsyncDiffView = defineAsyncComponent(() =>
  import("@git-diff-view/vue").then(({ DiffView }) => DiffView),
);
const props = withDefaults(
  defineProps<{ directory?: string; active: boolean; fontSize?: number }>(),
  {
    fontSize: 13,
  },
);
const emit = defineEmits<{ collapse: []; available: [value: boolean] }>();
const { state, loading, refresh } = useGitDiff(toRef(props, "directory"), toRef(props, "active"));

const files = computed(() => splitGitDiff(state.value?.diff ?? ""));
const expandedFiles = ref(new Set<string>());
const defaultExpandedFileCount = 3;
let initializedRepository: string | undefined;
let previousFileCount = 0;

const allFilesExpanded = computed(
  () => files.value.length > 0 && files.value.every((file) => expandedFiles.value.has(file.key)),
);

function toggleFile(key: string) {
  const next = new Set(expandedFiles.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedFiles.value = next;
}

function toggleAllFiles() {
  expandedFiles.value = allFilesExpanded.value
    ? new Set()
    : new Set(files.value.map((file) => file.key));
}

function baseName(path: string) {
  return path.split("/").pop() ?? path;
}

function parentPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator + 1);
}

watch(
  [() => state.value?.repository, files],
  ([repository, currentFiles]) => {
    const shouldUseDefaults =
      repository !== initializedRepository || (previousFileCount === 0 && currentFiles.length > 0);
    const availableKeys = new Set(currentFiles.map((file) => file.key));

    expandedFiles.value = shouldUseDefaults
      ? new Set(currentFiles.slice(0, defaultExpandedFileCount).map((file) => file.key))
      : new Set([...expandedFiles.value].filter((key) => availableKeys.has(key)));
    initializedRepository = repository;
    previousFileCount = currentFiles.length;
  },
  { immediate: true },
);

watch(state, (result) => {
  if (result) emit("available", Boolean(result.repository));
});
</script>

<template>
  <aside class="diff-sidebar">
    <div v-if="state?.error" class="diff-message error">{{ state.error }}</div>
    <div v-else-if="!state?.repository" class="diff-message">
      No Git repository in this terminal directory.
    </div>
    <div v-else-if="!files.length" class="diff-message">Working tree is clean.</div>
    <template v-else>
      <div class="files-toolbar">
        <span>{{ files.length }} changed {{ files.length === 1 ? "file" : "files" }}</span>
        <button type="button" @click="toggleAllFiles">
          {{ allFilesExpanded ? "Collapse all" : "Expand all" }}
        </button>
      </div>
      <div class="diff-content">
        <section v-for="file in files" :key="file.key" class="file-change">
          <button
            class="file-toggle"
            type="button"
            :aria-expanded="expandedFiles.has(file.key)"
            :title="file.path"
            @click="toggleFile(file.key)"
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
          <div v-if="expandedFiles.has(file.key)" class="file-diff">
            <AsyncDiffView
              :data="file"
              :diff-view-mode="4"
              diff-view-theme="dark"
              :diff-view-highlight="true"
              :diff-view-wrap="true"
              :diff-view-font-size="props.fontSize * (10 / 13)"
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
        :class="{ loading }"
        @click="refresh"
      >
        ↻
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.diff-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: var(--color-panel-bg);
}
.diff-message {
  padding: 18px 14px;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.5;
}
.diff-message.error {
  color: var(--color-status-error);
}
.files-toolbar {
  display: flex;
  height: 32px;
  flex: 0 0 32px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #20232d;
  color: #778196;
  font-size: 0.625rem;
}
.files-toolbar button {
  padding: 3px 0;
  border: 0;
  color: #929db2;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.files-toolbar button:hover {
  color: #d7dce7;
}
.diff-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.file-change {
  border-bottom: 1px solid #20232d;
}
.file-toggle {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 36px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  color: #c5ccda;
  background: #171a22;
  text-align: left;
  cursor: pointer;
}
.file-toggle:hover {
  background: #1d222d;
}
.file-toggle > svg {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  fill: none;
  stroke: #707b90;
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
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  place-items: center;
  border-radius: 4px;
  color: #aab4c8;
  background: #292f3c;
  font-family: "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5625rem;
  font-weight: 700;
}
.file-status.added {
  color: #7fd39b;
  background: #173526;
}
.file-status.deleted {
  color: #ee9096;
  background: #3b2026;
}
.file-status.renamed {
  color: #89b9ec;
  background: #1d3045;
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
  color: #667186;
}
.line-counts {
  display: flex;
  flex: 0 0 auto;
  gap: 5px;
  font-family: "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  font-size: 0.5625rem;
}
.additions {
  color: #65c889;
}
.deletions {
  color: #e47c84;
}
.file-diff {
  overflow: hidden;
  border-top: 1px solid #20232d;
}
.file-diff :deep(.git-diff-view) {
  border: 0;
  border-radius: 0;
}
.diff-footer {
  display: flex;
  height: 38px;
  flex: 0 0 38px;
  align-items: center;
  margin-top: auto;
  padding: 0 11px;
  border-top: 1px solid var(--color-border);
}
.diff-footer button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  color: #696c73;
  background: transparent;
  cursor: pointer;
}
.diff-footer button:hover {
  color: #c6c8cc;
}
.refresh-button {
  margin-left: auto;
}
.diff-footer button.loading {
  animation: spin 0.8s linear infinite;
}
.diff-footer svg {
  width: 14px;
  height: 14px;
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
