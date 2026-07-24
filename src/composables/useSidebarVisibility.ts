import { computed, ref, watch, type Ref, type WritableComputedRef } from "vue";

export type SidebarVisibility = {
  open: WritableComputedRef<boolean>;
  preferredOpen: Ref<boolean>;
  temporarilyOpen: Ref<boolean>;
  openTemporarily: () => void;
  restorePreference: () => void;
  toggle: () => void;
  close: () => void;
};

export function useSidebarVisibility(initiallyOpen: boolean): SidebarVisibility {
  const preferredOpen = ref(initiallyOpen);
  const temporarilyOpen = ref(false);
  const open = computed({
    get: () => preferredOpen.value || temporarilyOpen.value,
    set: (value: boolean) => {
      preferredOpen.value = value;
      temporarilyOpen.value = false;
    },
  });

  function openTemporarily(): void {
    if (!open.value) temporarilyOpen.value = true;
  }

  function restorePreference(): void {
    temporarilyOpen.value = false;
  }

  function toggle(): void {
    const wasOpen = open.value;
    temporarilyOpen.value = false;
    preferredOpen.value = !wasOpen;
  }

  function close(): void {
    preferredOpen.value = false;
    temporarilyOpen.value = false;
  }

  return {
    open,
    preferredOpen,
    temporarilyOpen,
    openTemporarily,
    restorePreference,
    toggle,
    close,
  };
}

export function useResponsiveSidebarVisibility(
  initiallyOpen: boolean,
  temporaryOnly: Readonly<Ref<boolean>>,
): SidebarVisibility {
  const visibility = useSidebarVisibility(initiallyOpen);
  const open = computed({
    get: () =>
      visibility.temporarilyOpen.value || (!temporaryOnly.value && visibility.preferredOpen.value),
    set: (value: boolean) => {
      if (temporaryOnly.value) visibility.temporarilyOpen.value = value;
      else visibility.open.value = value;
    },
  });

  function openTemporarily(): void {
    if (temporaryOnly.value) visibility.temporarilyOpen.value = true;
    else visibility.openTemporarily();
  }

  function toggle(): void {
    if (temporaryOnly.value) visibility.temporarilyOpen.value = !open.value;
    else visibility.toggle();
  }

  function close(): void {
    if (temporaryOnly.value) visibility.restorePreference();
    else visibility.close();
  }

  watch(
    temporaryOnly,
    (enabled) => {
      if (enabled) visibility.restorePreference();
    },
    { flush: "sync" },
  );

  return {
    ...visibility,
    open,
    openTemporarily,
    toggle,
    close,
  };
}
