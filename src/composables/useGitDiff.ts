import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { getProjectGitDiff, type GitDiff } from "../api/git";

const POLL_INTERVAL = 2_000;

export function useGitDiff(
  directory: Readonly<Ref<string | undefined>>,
  active: Readonly<Ref<boolean>>,
) {
  const state = ref<GitDiff>();
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
      const result = await getProjectGitDiff(requestedDirectory);
      if (
        !disposed &&
        generation === directoryGeneration &&
        requestedDirectory === directory.value
      ) {
        state.value = result;
      }
    } catch (error) {
      if (
        !disposed &&
        generation === directoryGeneration &&
        requestedDirectory === directory.value
      ) {
        state.value = { directory: "", diff: "", error: String(error) };
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

  watch(
    directory,
    () => {
      directoryGeneration += 1;
      void refresh();
    },
    { immediate: true },
  );

  watch(
    active,
    (isActive, wasActive) => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
      if (!isActive) return;

      if (wasActive === false) void refresh();
      timer = window.setInterval(() => void requestRefresh(false), POLL_INTERVAL);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    disposed = true;
    directoryGeneration += 1;
    if (timer !== undefined) window.clearInterval(timer);
  });

  return { state, loading, refresh };
}
