<script setup lang="ts">
import { DiffModeEnum, DiffView } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view-pure.css";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getProjectGitDiff, type GitDiff } from "../api/git";

type DiffData = {
  key: string;
  oldFile: { fileName: string };
  newFile: { fileName: string };
  hunks: string[];
};

const props = defineProps<{ directory?: string }>();
const emit = defineEmits<{ collapse: []; available: [value: boolean] }>();
const state = ref<GitDiff>();
const loading = ref(false);
let timer: number | undefined;

const repositoryName = computed(
  () => state.value?.repository?.split(/[\\/]/).pop() ?? "No repository",
);
const files = computed<DiffData[]>(() => splitGitDiff(state.value?.diff ?? ""));

async function refresh(): Promise<void> {
  if (!props.directory) {
    state.value = undefined;
    emit("available", false);
    return;
  }

  loading.value = true;
  try {
    state.value = await getProjectGitDiff(props.directory);
    emit("available", Boolean(state.value.repository));
  } catch (error) {
    state.value = { directory: "", diff: "", error: String(error) };
  } finally {
    loading.value = false;
  }
}

function splitGitDiff(diff: string): DiffData[] {
  return diff
    .split(/(?=^diff --git )/m)
    .filter(Boolean)
    .map((hunk, index) => {
      const header = hunk.match(/^diff --git a\/(.+) b\/(.+)$/m);
      const oldFile = hunk.match(/^--- (?:a\/)?(.+)$/m)?.[1] ?? header?.[1] ?? "Deleted file";
      const newFile = hunk.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1] ?? header?.[2] ?? "New file";

      return {
        key: `${oldFile}-${newFile}-${index}`,
        oldFile: { fileName: oldFile === "/dev/null" ? newFile : oldFile },
        newFile: { fileName: newFile === "/dev/null" ? oldFile : newFile },
        hunks: [hunk],
      };
    });
}

watch(
  () => props.directory,
  () => void refresh(),
  { immediate: true },
);

timer = window.setInterval(() => void refresh(), 2_000);
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
});
</script>

<template>
  <aside class="diff-sidebar">
    <header class="diff-header">
      <div>
        <strong>Git changes</strong><span>{{ repositoryName }}</span>
      </div>
      <button
        class="refresh-button"
        type="button"
        title="Refresh diff"
        :class="{ loading }"
        @click="refresh"
      >
        ↻
      </button>
    </header>
    <div class="directory" :title="state?.directory">
      {{ state?.directory || "Waiting for terminal…" }}
    </div>
    <div v-if="state?.error" class="diff-message error">{{ state.error }}</div>
    <div v-else-if="!state?.repository" class="diff-message">
      No Git repository in this terminal directory.
    </div>
    <div v-else-if="!files.length" class="diff-message">Working tree is clean.</div>
    <div v-else class="diff-content">
      <DiffView
        v-for="file in files"
        :key="file.key"
        :data="file"
        :diff-view-mode="DiffModeEnum.Unified"
        diff-view-theme="dark"
        :diff-view-highlight="true"
        :diff-view-wrap="true"
        :diff-view-font-size="10"
      />
    </div>
    <footer class="diff-footer">
      <button type="button" title="Hide Git changes" @click="emit('collapse')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.diff-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: #10131a;
}
.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 14px 12px;
  border-bottom: 1px solid #20232d;
}
.diff-header strong,
.diff-header span {
  display: block;
}
.diff-header strong {
  color: #e6eaf2;
  font-size: 12px;
}
.diff-header span {
  margin-top: 3px;
  color: #778196;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
}
.refresh-button {
  width: 25px;
  height: 25px;
  border: 1px solid #303645;
  border-radius: 6px;
  color: #aeb7ca;
  background: #191d27;
  cursor: pointer;
}
.refresh-button:hover {
  color: #eef2fa;
  background: #242a38;
}
.refresh-button.loading {
  animation: spin 0.8s linear infinite;
}
.directory {
  overflow: hidden;
  padding: 9px 14px;
  border-bottom: 1px solid #1b1e26;
  color: #687287;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-message {
  padding: 18px 14px;
  color: #737c91;
  font-size: 11px;
  line-height: 1.5;
}
.diff-message.error {
  color: #f7768e;
}
.diff-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.diff-content :deep(.git-diff-view) {
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
  border-top: 1px solid #252a38;
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
