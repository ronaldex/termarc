import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useRightSidebarController } from "./useRightSidebarController";

function setup(options: { subterminals?: boolean; git?: boolean; panelFocused?: boolean } = {}) {
  const open = ref(false);
  const panelFocused = ref(options.panelFocused ?? false);
  const focusPanel = vi.fn();
  const focusWorkspace = vi.fn();
  const focusTerminal = vi.fn();
  const restorePreference = vi.fn();
  const close = vi.fn(() => {
    open.value = false;
  });
  const toggle = vi.fn(() => {
    open.value = !open.value;
  });
  const openTemporarily = vi.fn(() => {
    open.value = true;
  });
  const scheduled: Array<() => void> = [];
  const controller = useRightSidebarController({
    subterminalsAvailable: ref(options.subterminals ?? true),
    gitAvailable: ref(options.git ?? true),
    open,
    openTemporarily,
    restorePreference,
    toggle,
    close,
    focusPanel,
    hasPanelFocus: () => panelFocused.value,
    focusWorkspace,
    focusTerminal,
    scheduleFocus: (callback) => scheduled.push(callback),
  });
  const flushFocus = () => scheduled.splice(0).forEach((callback) => callback());
  return {
    controller,
    open,
    panelFocused,
    openTemporarily,
    restorePreference,
    toggle,
    close,
    focusPanel,
    focusWorkspace,
    focusTerminal,
    flushFocus,
  };
}

describe("useRightSidebarController", () => {
  it("owns effective open state, availability, preview, and toggling", () => {
    const state = setup();

    expect(state.controller.modes.value).toEqual(["subterminals", "git"]);
    expect(state.controller.open.value).toBe(false);
    expect(state.controller.preview("git")).toBe(true);
    expect(state.controller.mode.value).toBe("git");
    expect(state.controller.open.value).toBe(true);
    expect(state.openTemporarily).toHaveBeenCalledOnce();

    expect(state.controller.toggle()).toBe(true);
    expect(state.toggle).toHaveBeenCalledOnce();
    expect(state.controller.open.value).toBe(false);

    const unavailable = setup({ subterminals: false, git: false });
    expect(unavailable.controller.available.value).toBe(false);
    expect(unavailable.controller.preview()).toBe(false);
    expect(unavailable.controller.toggle()).toBe(false);
    expect(unavailable.toggle).not.toHaveBeenCalled();
  });

  it("routes panel, adjacent-mode, terminal, workspace, close, and blur focus policy", () => {
    const state = setup({ panelFocused: true });

    expect(state.controller.openAndFocus("subterminals")).toBe(true);
    state.flushFocus();
    expect(state.focusPanel).toHaveBeenCalledTimes(1);

    expect(state.controller.moveAndFocus(1)).toBe(true);
    state.flushFocus();
    expect(state.controller.mode.value).toBe("git");
    expect(state.focusPanel).toHaveBeenCalledTimes(2);

    state.controller.focusWorkspace("terminal");
    state.flushFocus();
    expect(state.restorePreference).toHaveBeenCalledTimes(1);
    expect(state.focusTerminal).toHaveBeenCalledOnce();

    state.controller.focusWorkspace("workspace");
    state.flushFocus();
    expect(state.focusWorkspace).toHaveBeenCalledOnce();

    state.controller.close();
    state.flushFocus();
    expect(state.close).toHaveBeenCalledOnce();
    expect(state.focusWorkspace).toHaveBeenCalledTimes(2);

    state.panelFocused.value = false;
    state.controller.restoreOnBlur();
    expect(state.restorePreference).toHaveBeenCalledTimes(3);
  });
});
