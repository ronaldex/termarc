import { nextTick, watch, type Ref } from "vue";

export interface ScrollIntoViewContainer {
  ensureElementVisible(element: HTMLElement): void;
}

export function useScrollActiveItem(
  activeId: () => string,
  activeElement: Ref<HTMLElement | undefined>,
  container: Ref<ScrollIntoViewContainer | undefined>,
): void {
  watch(
    activeId,
    async () => {
      await nextTick();
      const element = activeElement.value;
      if (element) container.value?.ensureElementVisible(element);
    },
    { immediate: true, flush: "post" },
  );
}
