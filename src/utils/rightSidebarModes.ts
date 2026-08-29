import type { RightSidebarAvailability, RightSidebarMode } from "../types/rightSidebar";

export const RIGHT_SIDEBAR_MODE_ORDER: readonly RightSidebarMode[] = ["subterminals", "git"];

export function availableRightSidebarModes(
  availability: RightSidebarAvailability,
): RightSidebarMode[] {
  return RIGHT_SIDEBAR_MODE_ORDER.filter((mode) => availability[mode]);
}

export function resolveRightSidebarMode(
  availability: RightSidebarAvailability,
  preferred?: RightSidebarMode,
): RightSidebarMode | undefined {
  const modes = availableRightSidebarModes(availability);
  return preferred && modes.includes(preferred) ? preferred : modes[0];
}

export function cycleRightSidebarMode(
  availability: RightSidebarAvailability,
  active?: RightSidebarMode,
): RightSidebarMode | undefined {
  const modes = availableRightSidebarModes(availability);
  if (!modes.length) return undefined;
  const index = active ? modes.indexOf(active) : -1;
  return modes[(index + 1) % modes.length];
}
