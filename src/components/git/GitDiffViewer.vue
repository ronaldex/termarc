<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";
import { resolveTerminalPath } from "../../api/paths";
import { useAppSettings } from "../../composables/useAppSettings";
import { useDiffExpansion } from "../../composables/useDiffExpansion";
import { useGitDiff } from "../../composables/useGitDiff";
import { openPath } from "../../services/externalEditor";
import { externalEditorLabel } from "../../settings/options";
import { themeDefinition } from "../../themes/themeCatalog";
import { splitGitDiff } from "../../utils/gitDiff";
import type { ExternalEditor } from "../../types/settings";
import ExpandedGitDiff from "./ExpandedGitDiff.vue";

const props = withDefaults(
  defineProps<{
    directory?: string;
    active: boolean;
    fontSize?: number;
    externalEditor: ExternalEditor;
  }>(),
  { fontSize: 13 },
);
const emit = defineEmits<{
  available: [value: boolean];
}>();
const { settings } = useAppSettings();
const panelElement = ref<HTMLElement>();
const expandedView = ref<InstanceType<typeof ExpandedGitDiff>>();
const { state, loading, refresh } = useGitDiff(toRef(props, "directory"), toRef(props, "active"));

const files = computed(() => {
  const result = state.value;
  if (!result) return [];
  if ("files" in result) {
    return result.files.map((file) => ({
      ...file,
      key: `summary:${file.path}`,
      oldFile: { fileName: file.path },
      newFile: { fileName: file.path },
      hunks: [],
    }));
  }
  return splitGitDiff(result.diff);
});
const repository = computed(() => state.value?.repository);
const diffTheme = computed(() => themeDefinition(settings.colorTheme).colorScheme);
const editorName = computed(() => externalEditorLabel(props.externalEditor));
const { expandedFiles, allFilesExpanded, toggleFile, expandAllFiles, collapseAllFiles } =
  useDiffExpansion(repository, files);

async function openFile(path: string): Promise<void> {
  const repositoryPath = state.value?.repository;
  if (!repositoryPath) return;

  try {
    const resolved = await resolveTerminalPath(repositoryPath, path);
    if (resolved?.kind === "file") await openPath(resolved.path, props.externalEditor);
  } catch (error) {
    console.error("Could not open diff file", error);
  }
}

const pendingRevealPath = ref<string>();

async function revealPendingFile(): Promise<void> {
  const path = pendingRevealPath.value;
  if (!path || !props.active) return;
  const file = files.value.find((item) => item.path === path && item.hunks.length);
  if (!file) {
    if (state.value && "diff" in state.value) pendingRevealPath.value = undefined;
    return;
  }

  pendingRevealPath.value = undefined;
  if (!expandedFiles.value.has(file.key)) toggleFile(file.key);
  await nextTick();
  requestAnimationFrame(() => {
    panelElement.value
      ?.querySelector<HTMLElement>(`[data-diff-file-key="${CSS.escape(file.key)}"]`)
      ?.scrollIntoView({ block: "start" });
  });
}

function revealFile(path: string): void {
  pendingRevealPath.value = path;
  void nextTick(revealPendingFile);
}

async function focusPanel(): Promise<void> {
  await nextTick();
  if (props.active) expandedView.value?.focusActiveFile();
  else panelElement.value?.focus({ preventScroll: true });
}

function hasPanelFocus(): boolean {
  return panelElement.value?.contains(document.activeElement) ?? false;
}

defineExpose({ focusPanel, hasPanelFocus });

watch(state, (result) => {
  // A mode or polling transition may temporarily clear the result while a
  // refresh is in flight. Keep the last known availability until the selected
  // project changes (App.vue resets it there) or a new result arrives.
  if (result) emit("available", Boolean(result.error || files.value.length));
  void revealPendingFile();
});
</script>

<template>
  <div ref="panelElement" class="diff-content-view" aria-label="Git changes" tabindex="-1">
    <ExpandedGitDiff
      ref="expandedView"
      :files="files"
      :error="state?.error"
      :repository="state?.repository"
      :font-size="props.fontSize"
      :diff-theme="diffTheme"
      :expanded-files="expandedFiles"
      :all-files-expanded="allFilesExpanded"
      :editor-name="editorName"
      @toggle-file="toggleFile"
      @expand-all="expandAllFiles"
      @collapse-all="collapseAllFiles"
      @open-file="openFile"
    />
  </div>
</template>

<style scoped>
.diff-content-view {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  background: var(--color-panel-bg);
}
</style>
