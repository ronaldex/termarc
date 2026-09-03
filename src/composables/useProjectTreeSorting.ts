import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { DropPlacement } from "../utils/terminalOrdering";

export type SortItem = {
  kind: "project" | "terminal" | "command" | "agent";
  projectId: string;
  id: string;
};
export type SortTarget = SortItem & { placement: DropPlacement };

export function useProjectTreeSorting(options: {
  enabled: Ref<boolean>;
  scrollViewport: () => HTMLElement | undefined;
  onDrop: (source: SortItem, target: SortTarget) => void;
}) {
  const draggedItem = ref<SortItem>();
  const dropTarget = ref<SortTarget>();
  let pending:
    | { item: SortItem; pointerId: number; startX: number; startY: number; capture?: Element }
    | undefined;
  let autoscrollFrame: number | undefined;
  let pointerY = 0;
  let dragged = false;

  function beginPointerDrag(event: PointerEvent, item: SortItem): void {
    if (!options.enabled.value || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button.close, .command-actions")) return;
    finishPointerDrag();
    const capture = event.currentTarget instanceof Element ? event.currentTarget : undefined;
    pending = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      capture,
    };
    window.addEventListener("pointermove", movePointerDrag, { passive: false });
    window.addEventListener("pointerup", endPointerDrag);
    window.addEventListener("pointercancel", cancelPointerDrag);
    window.addEventListener("blur", cancelPointerDrag);
    document.addEventListener("visibilitychange", cancelWhenHidden);
  }

  function movePointerDrag(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (!dragged && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < 4)
      return;
    dragged = true;
    draggedItem.value = pending.item;
    const capture = pending.capture;
    if (capture instanceof HTMLElement) {
      capture.setPointerCapture?.(event.pointerId);
      capture.addEventListener("lostpointercapture", cancelPointerDrag, { once: true });
    }
    pointerY = event.clientY;
    event.preventDefault();
    updateDropTarget(event.clientX, event.clientY);
    startAutoscroll();
  }

  function updateDropTarget(x: number, y: number): void {
    let element = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-sort-kind][data-sort-id]");
    if (
      element?.dataset.sortKind === "terminal" &&
      element.dataset.sortParentId &&
      x < element.getBoundingClientRect().left + 32
    ) {
      element = element.parentElement?.closest<HTMLElement>(
        '.sortable-row[data-sort-kind="terminal"]',
      );
    }
    const kind = element?.dataset.sortKind;
    const projectId = element?.dataset.projectId;
    const id = element?.dataset.sortId;
    if (
      !pending ||
      !element ||
      (kind !== "project" && kind !== "terminal" && kind !== "command" && kind !== "agent") ||
      !projectId ||
      !id ||
      kind !== pending.item.kind ||
      (kind !== "project" && projectId !== pending.item.projectId)
    ) {
      dropTarget.value = undefined;
      return;
    }
    const bounds = element.getBoundingClientRect();
    dropTarget.value = {
      kind,
      projectId,
      id,
      placement: y < bounds.top + bounds.height / 2 ? "before" : "after",
    };
  }

  function startAutoscroll(): void {
    if (autoscrollFrame !== undefined) return;
    const tick = () => {
      autoscrollFrame = undefined;
      if (!dragged) return;
      const viewport = options.scrollViewport();
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const edge = Math.min(40, bounds.height / 4);
      const distance =
        pointerY < bounds.top + edge
          ? pointerY - (bounds.top + edge)
          : pointerY > bounds.bottom - edge
            ? pointerY - (bounds.bottom - edge)
            : 0;
      if (distance) {
        viewport.scrollTop += Math.max(-12, Math.min(12, distance / 3));
        updateDropTarget(bounds.left + bounds.width / 2, pointerY);
        autoscrollFrame = requestAnimationFrame(tick);
      }
    };
    autoscrollFrame = requestAnimationFrame(tick);
  }

  function endPointerDrag(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (dragged) {
      if (draggedItem.value && dropTarget.value)
        options.onDrop(draggedItem.value, dropTarget.value);
      // A completed gesture must never activate a row, including invalid drops.
      suppressNextClick();
    }
    finishPointerDrag();
  }

  function cancelWhenHidden(): void {
    if (document.visibilityState === "hidden") cancelPointerDrag();
  }
  function cancelPointerDrag(): void {
    finishPointerDrag();
  }
  function finishPointerDrag(): void {
    const current = pending;
    pending = undefined;
    dragged = false;
    draggedItem.value = undefined;
    dropTarget.value = undefined;
    if (autoscrollFrame !== undefined) cancelAnimationFrame(autoscrollFrame);
    autoscrollFrame = undefined;
    window.removeEventListener("pointermove", movePointerDrag);
    window.removeEventListener("pointerup", endPointerDrag);
    window.removeEventListener("pointercancel", cancelPointerDrag);
    window.removeEventListener("blur", cancelPointerDrag);
    document.removeEventListener("visibilitychange", cancelWhenHidden);
    if (current?.capture instanceof HTMLElement) {
      current.capture.removeEventListener("lostpointercapture", cancelPointerDrag);
      if (current.capture.hasPointerCapture?.(current.pointerId))
        current.capture.releasePointerCapture(current.pointerId);
    }
  }
  function suppressNextClick(): void {
    const suppress = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.removeEventListener("click", suppress, true);
    };
    window.addEventListener("click", suppress, true);
    window.setTimeout(() => window.removeEventListener("click", suppress, true), 0);
  }
  function dropClass(item: SortItem): Record<string, boolean> {
    const target = dropTarget.value;
    const source = draggedItem.value;
    const matches = (candidate: SortItem | undefined) =>
      candidate?.kind === item.kind &&
      candidate.projectId === item.projectId &&
      candidate.id === item.id;
    return {
      dragging: matches(source),
      "drop-before": Boolean(matches(target) && target?.placement === "before"),
      "drop-after": Boolean(matches(target) && target?.placement === "after"),
    };
  }

  watch(options.enabled, (enabled) => {
    if (!enabled) finishPointerDrag();
  });
  onBeforeUnmount(finishPointerDrag);
  return { beginPointerDrag, draggedItem, dropTarget, dropClass, finishPointerDrag };
}
