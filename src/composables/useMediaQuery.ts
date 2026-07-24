import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from "vue";

export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const mediaQuery = typeof window === "undefined" ? undefined : window.matchMedia(query);
  const matches = ref(mediaQuery?.matches ?? false);

  function update(event: MediaQueryListEvent): void {
    matches.value = event.matches;
  }

  onMounted(() => {
    if (!mediaQuery) return;
    matches.value = mediaQuery.matches;
    mediaQuery.addEventListener("change", update);
  });
  onBeforeUnmount(() => mediaQuery?.removeEventListener("change", update));

  return readonly(matches);
}
