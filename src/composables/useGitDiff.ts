import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import {
  getProjectGitDiff,
  getProjectGitDiffSummary,
  type GitDiff,
  type GitDiffSummaryResult,
} from "../api/git";

export type GitDiffState = GitDiff | GitDiffSummaryResult;

const EXPANDED_POLL_INTERVAL = 2_000;

export function useGitDiff(
  directory: Readonly<Ref<string | undefined>>,
  active: Readonly<Ref<boolean>>,
  enabled: Readonly<Ref<boolean>> = active,
) {
  const state = ref<GitDiffState>();
  const loading = ref(false);
  let directoryGeneration = 0;
  let inFlight = false;
  let refreshQueued = false;
  let timer: number | undefined;
  let disposed = false;

  function refresh(): Promise<void> {
    return requestRefresh(true);
  }

  async function requestRefresh(queueIfBusy: boolean): Promise<void> {
    const requestedDirectory = directory.value;
    const requestedActive = active.value;
    // Probe once after workspace restoration so Git availability is known, but
    // reserve continuous polling and full diffs for the visible panel.
    if (!enabled.value || document.hidden) return;
    if (!requestedDirectory) {
      directoryGeneration += 1;
      refreshQueued = false;
      state.value = undefined;
      return;
    }

    if (inFlight) {
      if (queueIfBusy) refreshQueued = true;
      return;
    }

    const generation = directoryGeneration;
    inFlight = true;
    loading.value = true;
    try {
      const result = requestedActive
        ? await getProjectGitDiff(requestedDirectory)
        : await getProjectGitDiffSummary(requestedDirectory);
      if (
        !disposed &&
        generation === directoryGeneration &&
        requestedDirectory === directory.value &&
        requestedActive === active.value
      ) {
        state.value = result;
      }
    } catch (error) {
      if (
        !disposed &&
        generation === directoryGeneration &&
        requestedDirectory === directory.value &&
        requestedActive === active.value
      ) {
        state.value = requestedActive
          ? { directory: requestedDirectory, diff: "", error: String(error) }
          : { directory: requestedDirectory, files: [], error: String(error) };
      }
    } finally {
      inFlight = false;
      loading.value = false;
      if (refreshQueued && !disposed) {
        refreshQueued = false;
        void refresh();
      }
    }
  }

  function restartPolling(): void {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    if (!active.value || !directory.value || document.hidden) return;

    timer = window.setInterval(() => void requestRefresh(false), EXPANDED_POLL_INTERVAL);
  }

  watch(
    directory,
    () => {
      directoryGeneration += 1;
      state.value = undefined;
      if (enabled.value) void refresh();
      restartPolling();
    },
    { immediate: true },
  );

  watch(
    active,
    (isActive, wasActive) => {
      restartPolling();
      if (isActive && wasActive !== undefined && isActive !== wasActive) {
        directoryGeneration += 1;
        // Preserve the last result while refreshing. Clearing it here makes a
        // conditionally available Git sidebar remove its own active mode.
        void refresh();
      }
    },
    { immediate: true },
  );

  watch(enabled, (isEnabled, wasEnabled) => {
    restartPolling();
    if (isEnabled && !wasEnabled) void refresh();
  });

  function handleVisibilityChange(): void {
    restartPolling();
    if (!document.hidden && enabled.value) void refresh();
  }

  onMounted(() => document.addEventListener("visibilitychange", handleVisibilityChange));
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    disposed = true;
    directoryGeneration += 1;
    if (timer !== undefined) window.clearInterval(timer);
  });

  return { state, loading, refresh };
}
