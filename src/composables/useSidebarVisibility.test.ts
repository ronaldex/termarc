import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { useResponsiveSidebarVisibility, useSidebarVisibility } from "./useSidebarVisibility";

describe("useSidebarVisibility", () => {
  it("opens temporarily without changing the preferred state", () => {
    const visibility = useSidebarVisibility(false);

    visibility.openTemporarily();

    expect(visibility.open.value).toBe(true);
    expect(visibility.preferredOpen.value).toBe(false);
    expect(visibility.temporarilyOpen.value).toBe(true);
  });

  it("restores the preferred state after a temporary opening", () => {
    const visibility = useSidebarVisibility(false);
    visibility.openTemporarily();

    visibility.restorePreference();

    expect(visibility.open.value).toBe(false);
    expect(visibility.preferredOpen.value).toBe(false);
  });

  it("keeps a preferred sidebar open when restoring", () => {
    const visibility = useSidebarVisibility(true);

    visibility.restorePreference();

    expect(visibility.open.value).toBe(true);
  });

  it("toggles the effective state and clears temporary state", () => {
    const visibility = useSidebarVisibility(false);
    visibility.openTemporarily();

    visibility.toggle();

    expect(visibility.open.value).toBe(false);
    expect(visibility.temporarilyOpen.value).toBe(false);
  });

  it("closes both preferred and temporary visibility", () => {
    const visibility = useSidebarVisibility(true);
    visibility.temporarilyOpen.value = true;

    visibility.close();

    expect(visibility.open.value).toBe(false);
    expect(visibility.preferredOpen.value).toBe(false);
    expect(visibility.temporarilyOpen.value).toBe(false);
  });
});

describe("useResponsiveSidebarVisibility", () => {
  it("collapses when entering temporary-only mode and preserves the wider preference", () => {
    const temporaryOnly = ref(false);
    const visibility = useResponsiveSidebarVisibility(true, temporaryOnly);
    visibility.openTemporarily();

    temporaryOnly.value = true;

    expect(visibility.open.value).toBe(false);
    expect(visibility.temporarilyOpen.value).toBe(false);
    expect(visibility.preferredOpen.value).toBe(true);

    temporaryOnly.value = false;
    expect(visibility.open.value).toBe(true);
  });

  it("opens only temporarily in compact mode", () => {
    const temporaryOnly = ref(true);
    const visibility = useResponsiveSidebarVisibility(true, temporaryOnly);

    visibility.open.value = true;

    expect(visibility.open.value).toBe(true);
    expect(visibility.temporarilyOpen.value).toBe(true);
    visibility.restorePreference();
    expect(visibility.open.value).toBe(false);
  });

  it("toggles and closes only the temporary state in compact mode", () => {
    const temporaryOnly = ref(true);
    const visibility = useResponsiveSidebarVisibility(true, temporaryOnly);

    visibility.toggle();
    expect(visibility.open.value).toBe(true);
    visibility.close();

    expect(visibility.open.value).toBe(false);
    expect(visibility.preferredOpen.value).toBe(true);
  });

  it("collapses multiple sidebars on the same compact breakpoint transition", () => {
    const compactMode = ref(false);
    const left = useResponsiveSidebarVisibility(true, compactMode);
    const right = useResponsiveSidebarVisibility(false, compactMode);
    right.open.value = true;

    compactMode.value = true;

    expect(left.open.value).toBe(false);
    expect(right.open.value).toBe(false);
    expect(left.preferredOpen.value).toBe(true);
    expect(right.preferredOpen.value).toBe(true);
  });
});
