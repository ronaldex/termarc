import { computed, ref, watch, type Ref } from "vue";

export type SidebarIntent = "closed" | "temporary" | "preferred";
export type SidebarPresentation = "collapsed" | "overlay" | "docked";

export function useSidebarVisibility(
  compactMode: Readonly<Ref<boolean>>,
  initiallyPreferredOpen = false,
) {
  const preferredOpen = ref(initiallyPreferredOpen);
  const temporaryOpen = ref(false);
  // A preferred sidebar that becomes an overlay because of a resize should
  // behave like an automatic overlay when focus moves back to the workspace.
  const dismissPreferredOverlayOnFocus = ref(compactMode.value && initiallyPreferredOpen);
  const preferredOverlayDismissed = ref(false);
  const intent = computed<SidebarIntent>(() => {
    if (temporaryOpen.value) return "temporary";
    if (preferredOpen.value) return "preferred";
    return "closed";
  });
  const presentation = computed<SidebarPresentation>(() => {
    if (
      intent.value === "closed" ||
      (preferredOverlayDismissed.value && intent.value !== "temporary")
    )
      return "collapsed";
    if (intent.value === "temporary" || compactMode.value) return "overlay";
    return "docked";
  });
  const open = computed(() => presentation.value !== "collapsed");

  function openTemporarily(): void {
    if (preferredOpen.value && !preferredOverlayDismissed.value) return;
    temporaryOpen.value = true;
  }

  function openPreferred(): void {
    temporaryOpen.value = false;
    preferredOpen.value = true;
    preferredOverlayDismissed.value = false;
    dismissPreferredOverlayOnFocus.value = false;
  }

  function restorePreference(): void {
    temporaryOpen.value = false;
    if (compactMode.value && dismissPreferredOverlayOnFocus.value && preferredOpen.value) {
      preferredOverlayDismissed.value = true;
    }
  }

  function toggle(): void {
    if (open.value) {
      temporaryOpen.value = false;
      preferredOpen.value = false;
      preferredOverlayDismissed.value = false;
      dismissPreferredOverlayOnFocus.value = false;
      return;
    }
    openPreferred();
  }

  function close(): void {
    temporaryOpen.value = false;
    preferredOpen.value = false;
    preferredOverlayDismissed.value = false;
    dismissPreferredOverlayOnFocus.value = false;
  }

  watch(
    compactMode,
    (isCompact) => {
      if (isCompact) {
        temporaryOpen.value = false;
        dismissPreferredOverlayOnFocus.value = preferredOpen.value;
      } else {
        preferredOverlayDismissed.value = false;
        dismissPreferredOverlayOnFocus.value = false;
      }
    },
    { flush: "sync" },
  );

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
