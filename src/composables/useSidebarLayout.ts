import { onBeforeUnmount, ref } from "vue";

export function useSidebarLayout() {
  const leftOpen = ref(true);
  const rightOpen = ref(true);
  const leftWidth = ref(240);
  const rightWidth = ref(480);
  let stopResize: (() => void) | undefined;

  function startResize(side: "left" | "right", event: PointerEvent): void {
    event.preventDefault();
    stopResize?.();
    const initialX = event.clientX;
    const initialWidth = side === "left" ? leftWidth.value : rightWidth.value;
    const resize = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - initialX;
      const width = side === "left" ? initialWidth + delta : initialWidth - delta;
      if (side === "left") leftWidth.value = clamp(width, 180, 420);
      else rightWidth.value = clamp(width, 320, 620);
    };
    const stop = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (stopResize === stop) stopResize = undefined;
    };
    stopResize = stop;
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }

  onBeforeUnmount(() => stopResize?.());

  return { leftOpen, rightOpen, leftWidth, rightWidth, startResize };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
