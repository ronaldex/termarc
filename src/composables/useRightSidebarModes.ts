import { computed, ref, watch, type Ref } from "vue";
import type { RightSidebarAvailability, RightSidebarMode } from "../types/rightSidebar";
import {
  availableRightSidebarModes,
  cycleRightSidebarMode,
  resolveRightSidebarMode,
} from "../utils/rightSidebarModes";

export function useRightSidebarModes(
  availability: Ref<RightSidebarAvailability>,
  close: () => void,
) {
  const mode = ref<RightSidebarMode>("subterminals");
  const modes = computed(() => availableRightSidebarModes(availability.value));
  let lastMode: RightSidebarMode | undefined;

  function select(next: RightSidebarMode): boolean {
    if (!availability.value[next]) return false;
    mode.value = next;
    lastMode = next;
    return true;
  }
  function ensure(): RightSidebarMode | undefined {
    const next = resolveRightSidebarMode(availability.value, lastMode ?? mode.value);
    if (!next) close();
    else select(next);
    return next;
  }
  function cycle(): RightSidebarMode | undefined {
    const next = cycleRightSidebarMode(availability.value, mode.value);
    if (next) select(next);
    return next;
  }

  watch(availability, ensure, { deep: true, immediate: true });
  return { mode, modes, select, ensure, cycle };
}
