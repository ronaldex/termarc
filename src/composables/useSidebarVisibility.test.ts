import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { useSidebarVisibility } from "./useSidebarVisibility";

describe("useSidebarVisibility", () => {
  it("starts with the configured preference", () => {
    const closed = useSidebarVisibility(ref(false));
    const open = useSidebarVisibility(ref(false), true);

    expect(closed.presentation.value).toBe("collapsed");
    expect(open.intent.value).toBe("preferred");
    expect(open.presentation.value).toBe("docked");
  });

  it("presents temporary openings as overlays and restores the closed state", () => {
    const visibility = useSidebarVisibility(ref(false));

    visibility.openTemporarily();

    expect(visibility.intent.value).toBe("temporary");
    expect(visibility.presentation.value).toBe("overlay");
    visibility.restorePreference();
    expect(visibility.presentation.value).toBe("collapsed");
  });

  it("keeps preferred openings when focus restoration runs", () => {
    const visibility = useSidebarVisibility(ref(false));

    visibility.openPreferred();
    visibility.restorePreference();

    expect(visibility.intent.value).toBe("preferred");
    expect(visibility.presentation.value).toBe("docked");
  });

  it("does not replace a preferred opening with a temporary one", () => {
    const visibility = useSidebarVisibility(ref(false), true);

    visibility.openTemporarily();

    expect(visibility.intent.value).toBe("preferred");
    expect(visibility.presentation.value).toBe("docked");
  });

  it("presents preferred openings as overlays in compact mode", () => {
    const visibility = useSidebarVisibility(ref(true), true);

    expect(visibility.intent.value).toBe("preferred");
    expect(visibility.presentation.value).toBe("overlay");
  });

  it("dismisses temporary openings across breakpoint changes", () => {
    const compactMode = ref(false);
    const visibility = useSidebarVisibility(compactMode);
    visibility.openTemporarily();

    compactMode.value = true;

    expect(visibility.intent.value).toBe("closed");
    expect(visibility.presentation.value).toBe("collapsed");
  });

  it("changes preferred openings between docked and overlay presentations", () => {
    const compactMode = ref(false);
    const visibility = useSidebarVisibility(compactMode, true);

    compactMode.value = true;
    expect(visibility.presentation.value).toBe("overlay");

    compactMode.value = false;
    expect(visibility.presentation.value).toBe("docked");
  });

  it("dismisses a preferred overlay when focus returns to the workspace", () => {
    const compactMode = ref(false);
    const visibility = useSidebarVisibility(compactMode, true);

    compactMode.value = true;
    visibility.restorePreference();

    expect(visibility.intent.value).toBe("preferred");
    expect(visibility.presentation.value).toBe("collapsed");

    compactMode.value = false;
    expect(visibility.presentation.value).toBe("docked");
  });

  it("can preview a dismissed preferred sidebar without losing its preference", () => {
    const compactMode = ref(false);
    const visibility = useSidebarVisibility(compactMode, true);

    compactMode.value = true;
    visibility.restorePreference();
    visibility.openTemporarily();

    expect(visibility.intent.value).toBe("temporary");
    expect(visibility.presentation.value).toBe("overlay");
    visibility.restorePreference();
    expect(visibility.intent.value).toBe("preferred");
    expect(visibility.presentation.value).toBe("collapsed");
  });

  it("toggles and closes either presentation", () => {
    const visibility = useSidebarVisibility(ref(false));

    visibility.toggle();
    expect(visibility.intent.value).toBe("preferred");
    visibility.toggle();
    expect(visibility.intent.value).toBe("closed");

    visibility.openTemporarily();
    visibility.close();
    expect(visibility.intent.value).toBe("closed");
  });
});
