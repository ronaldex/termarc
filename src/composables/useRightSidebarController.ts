import { computed, type Ref } from "vue";
import type { RightSidebarMode } from "../types/rightSidebar";
import { useRightSidebarModes } from "./useRightSidebarModes";

export type RightSidebarFocusTarget = "terminal" | "workspace";

export function useRightSidebarController(options: {
  subterminalsAvailable: Ref<boolean>;
  gitAvailable: Ref<boolean>;
  open: Ref<boolean>;
  openTemporarily: () => void;
  restorePreference: () => void;
  toggle: () => void;
  close: () => void;
  focusPanel: () => void | Promise<void>;
  hasPanelFocus: () => boolean;
  focusWorkspace: () => void;
  focusTerminal: () => void;
  scheduleFocus?: (callback: () => void) => void;
}) {
  const availability = computed(() => ({
    subterminals: options.subterminalsAvailable.value,
    git: options.gitAvailable.value,
  }));
  const { mode, modes, select, ensure } = useRightSidebarModes(availability, options.close);
  const available = computed(() => modes.value.length > 0);
  const open = computed(() => available.value && options.open.value);
  const scheduleFocus = options.scheduleFocus ?? ((callback) => requestAnimationFrame(callback));

  function preview(next?: RightSidebarMode): boolean {
    if (next && !select(next)) return false;
    if (!next && !ensure()) return false;
    options.openTemporarily();
    return true;
  }

  function openAndFocus(next?: RightSidebarMode): boolean {
    // Entering the panel from the main terminal should land on its subterminals,
    // rather than whichever auxiliary mode happened to be selected previously.
    const preferred = next ?? (availability.value.subterminals ? "subterminals" : undefined);
    if (!preview(preferred)) return false;
    scheduleFocus(() => void options.focusPanel());
    return true;
  }

  function resetOpenMode(): void {
    if (!open.value) return;
    const first = modes.value[0];
    if (first) select(first);
  }

  function move(direction: -1 | 1): boolean {
    const next = modes.value[modes.value.indexOf(mode.value) + direction];
    return next ? select(next) : false;
  }

  function moveAndFocus(direction: -1 | 1): boolean {
    if (!move(direction)) return false;
    scheduleFocus(() => void options.focusPanel());
    return true;
  }

  function toggle(): boolean {
    if (!available.value) return false;
    options.toggle();
    return true;
  }

  function close(routeFocus = options.hasPanelFocus()): void {
    options.close();
    if (routeFocus) scheduleFocus(options.focusWorkspace);
  }

  function focusWorkspace(target: RightSidebarFocusTarget): void {
    options.restorePreference();
    scheduleFocus(target === "terminal" ? options.focusTerminal : options.focusWorkspace);
  }

  function restoreOnBlur(): void {
    if (!options.hasPanelFocus()) options.restorePreference();
  }

  return {
    availability,
    available,
    open,
    mode,
    modes,
    select,
    ensure,
    preview,
    openAndFocus,
    resetOpenMode,
    move,
    moveAndFocus,
    toggle,
    close,
    focusWorkspace,
    restoreOnBlur,
  };
}
