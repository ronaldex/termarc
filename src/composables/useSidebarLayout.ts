import { onBeforeUnmount, ref } from "vue";
import { useMediaQuery } from "./useMediaQuery";
import { useSidebarVisibility } from "./useSidebarVisibility";

export function useSidebarLayout() {
  const compactSidebarMode = useMediaQuery("(max-width: 56rem)");
  const left = useSidebarVisibility(compactSidebarMode, true);
  const right = useSidebarVisibility(compactSidebarMode);
  const leftWidth = ref(240);
  const rightWidth = ref(480);
  let stopResize: (() => void) | undefined;

  function startResize(side: "left" | "right", event: PointerEvent): void {
    event.preventDefault();
    stopResize?.();

    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth.value : rightWidth.value;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "left") leftWidth.value = clamp(startWidth + delta, 190, 420);
      else rightWidth.value = Math.max(300, startWidth - delta);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      stopResize = undefined;
    };

    stopResize = stop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  }

  onBeforeUnmount(() => stopResize?.());

  return {
    leftOpen: left.open,
    leftPresentation: left.presentation,
    rightOpen: right.open,
    rightPresentation: right.presentation,
    leftWidth,
    rightWidth,
    openLeftTemporarily: left.openTemporarily,
    openLeftPreferred: left.openPreferred,
    restoreLeftPreference: left.restorePreference,
    toggleLeft: left.toggle,
    openRightPreferred: right.openPreferred,
    openRightTemporarily: right.openTemporarily,
    restoreRightPreference: right.restorePreference,
    toggleRight: right.toggle,
    closeRight: right.close,
    startResize,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
