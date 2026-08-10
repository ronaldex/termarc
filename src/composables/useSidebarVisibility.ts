import { computed, ref, watch, type Ref } from "vue";

export type SidebarIntent = "closed" | "temporary" | "preferred";
export type SidebarPresentation = "collapsed" | "overlay" | "docked";

export function useSidebarVisibility(
  compactMode: Readonly<Ref<boolean>>,
  initiallyPreferredOpen = false,
) {
  const intent = ref<SidebarIntent>(initiallyPreferredOpen ? "preferred" : "closed");
  const presentation = computed<SidebarPresentation>(() => {
    if (intent.value === "closed") return "collapsed";
    if (intent.value === "temporary" || compactMode.value) return "overlay";
    return "docked";
  });
  const open = computed(() => intent.value !== "closed");

  function openTemporarily(): void {
    if (intent.value === "closed") intent.value = "temporary";
  }

  function openPreferred(): void {
    intent.value = "preferred";
  }

  function restorePreference(): void {
    if (intent.value === "temporary") intent.value = "closed";
  }

  function toggle(): void {
    intent.value = intent.value === "closed" ? "preferred" : "closed";
  }

  function close(): void {
    intent.value = "closed";
  }

  watch(compactMode, () => restorePreference(), { flush: "sync" });

  return {
    intent,
    presentation,
    open,
    openTemporarily,
    openPreferred,
    restorePreference,
    toggle,
    close,
  };
}
