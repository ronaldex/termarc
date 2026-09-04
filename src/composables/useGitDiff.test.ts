// @vitest-environment happy-dom

import { createApp, defineComponent, nextTick, ref, type Ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectGitDiff, getProjectGitDiffSummary } from "../api/git";
import { useGitDiff } from "./useGitDiff";

vi.mock("../api/git", () => ({
  getProjectGitDiff: vi.fn(),
  getProjectGitDiffSummary: vi.fn(),
}));

const getDiff = vi.mocked(getProjectGitDiff);
const getSummary = vi.mocked(getProjectGitDiffSummary);
const result = { directory: "/project", repository: "/project", diff: "" };

type MountedDiff = {
  active: Ref<boolean>;
  enabled: Ref<boolean>;
  refresh: () => Promise<void>;
  unmount: () => void;
};

function mountDiff(active = false, enabled = active): MountedDiff {
  const directory = ref<string>();
  const isActive = ref(active);
  const isEnabled = ref(enabled);
  let refresh!: () => Promise<void>;
  const app = createApp(
    defineComponent({
      setup() {
        ({ refresh } = useGitDiff(directory, isActive, isEnabled));
        directory.value = "/project";
        return () => null;
      },
    }),
  );
  app.mount(document.createElement("div"));
  return { active: isActive, enabled: isEnabled, refresh, unmount: () => app.unmount() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useGitDiff", () => {
  it("does not fetch or poll while the Git UI is inactive", async () => {
    vi.useFakeTimers();
    const mounted = mountDiff();
    await nextTick();

    await vi.advanceTimersByTimeAsync(20_000);

    expect(getDiff).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it("probes availability once when enabled without polling while inactive", async () => {
    vi.useFakeTimers();
    getSummary.mockResolvedValue({ directory: "/project", repository: "/project", files: [] });
    const mounted = mountDiff(false, false);

    mounted.enabled.value = true;
    await nextTick();
    await vi.runAllTicks();
    expect(getSummary).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getSummary).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it("starts refreshing when active and stops polling when hidden", async () => {
    vi.useFakeTimers();
    getSummary.mockResolvedValue({ directory: "/project", repository: "/project", files: [] });
    getDiff.mockResolvedValue(result);
    const mounted = mountDiff(false, true);
    await nextTick();
    await vi.runAllTicks();

    mounted.active.value = true;
    await nextTick();
    await vi.runAllTicks();
    expect(getDiff).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(getDiff).toHaveBeenCalledTimes(2);

    mounted.active.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getDiff).toHaveBeenCalledTimes(2);
    mounted.unmount();
  });

  it("coalesces refresh requests received while a fetch is in flight", async () => {
    let resolveFirst!: (value: typeof result) => void;
    getDiff
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(result);
    const mounted = mountDiff(true);
    await nextTick();

    void mounted.refresh();
    void mounted.refresh();
    resolveFirst(result);
    await Promise.resolve();
    await Promise.resolve();

    expect(getDiff).toHaveBeenCalledTimes(2);
    mounted.unmount();
  });
});
