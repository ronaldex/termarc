import { computed, onBeforeUnmount, ref } from "vue";

export function useSidebarLayout() {
  const leftPreferredOpen = ref(true);
  const leftTemporarilyOpen = ref(false);
  const leftOpen = computed({
    get: () => leftPreferredOpen.value || leftTemporarilyOpen.value,
    set: (open: boolean) => {
      leftPreferredOpen.value = open;
      leftTemporarilyOpen.value = false;
    },
  });
  const rightOpen = ref(false);
  const leftWidth = ref(240);
  const rightWidth = ref(480);
  let stopResize: (() => void) | undefined;

  function openLeftTemporarily(): void {
    if (leftOpen.value) return;
    leftTemporarilyOpen.value = true;
  }

  function restoreLeftPreference(): void {
    leftTemporarilyOpen.value = false;
  }

  function toggleLeft(): void {
    const wasOpen = leftOpen.value;
    leftTemporarilyOpen.value = false;
    leftPreferredOpen.value = !wasOpen;
  }

  function startResize(side: "left" | "right", event: PointerEvent): void {
    event.preventDefault();
    stopResize?.();

    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth.value : rightWidth.value;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "left") leftWidth.value = clamp(startWidth + delta, 190, 420);
      else rightWidth.value = clamp(startWidth - delta, 300, 800);
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
    leftOpen,
    leftPreferredOpen,
    leftTemporarilyOpen,
    rightOpen,
    leftWidth,
    rightWidth,
    openLeftTemporarily,
    restoreLeftPreference,
    toggleLeft,
    startResize,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
