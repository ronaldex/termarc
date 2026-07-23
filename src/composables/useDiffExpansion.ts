import { computed, ref, watch, type Ref } from "vue";
import type { DiffData } from "../utils/gitDiff";

export function useDiffExpansion(
  repository: Ref<string | undefined>,
  files: Ref<DiffData[]>,
  defaultExpandedFileCount = 3,
) {
  const expandedFiles = ref(new Set<string>());
  let initializedRepository: string | undefined;
  let previousFileCount = 0;

  const allFilesExpanded = computed(
    () => files.value.length > 0 && files.value.every((file) => expandedFiles.value.has(file.key)),
  );

  function toggleFile(key: string): void {
    const next = new Set(expandedFiles.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedFiles.value = next;
  }

  function toggleAllFiles(): void {
    expandedFiles.value = allFilesExpanded.value
      ? new Set()
      : new Set(files.value.map((file) => file.key));
  }

  watch(
    [repository, files],
    ([currentRepository, currentFiles]) => {
      const shouldUseDefaults =
        currentRepository !== initializedRepository ||
        (previousFileCount === 0 && currentFiles.length > 0);
      const availableKeys = new Set(currentFiles.map((file) => file.key));

      expandedFiles.value = shouldUseDefaults
        ? new Set(currentFiles.slice(0, defaultExpandedFileCount).map((file) => file.key))
        : new Set([...expandedFiles.value].filter((key) => availableKeys.has(key)));
      initializedRepository = currentRepository;
      previousFileCount = currentFiles.length;
    },
    { immediate: true },
  );

  return { expandedFiles, allFilesExpanded, toggleFile, toggleAllFiles };
}
