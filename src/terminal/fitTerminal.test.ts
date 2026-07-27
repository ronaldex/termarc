import { describe, expect, it, vi } from "vitest";
import { fitTerminalToContainer } from "./fitTerminal";

function container(width: number, height: number, isConnected = true) {
  return {
    isConnected,
    getBoundingClientRect: () => ({ width, height }),
  } as HTMLElement;
}

function terminal(viewportY: number, baseY: number) {
  return {
    buffer: { active: { viewportY, baseY } },
    scrollToBottom: vi.fn(),
  };
}

describe("fitTerminalToContainer", () => {
  it("does not fit or resize a terminal hidden by layout", () => {
    const fit = vi.fn();
    const instance = terminal(0, 0);

    expect(fitTerminalToContainer(container(0, 0), instance, fit)).toBe(false);
    expect(fit).not.toHaveBeenCalled();
    expect(instance.scrollToBottom).not.toHaveBeenCalled();
  });

  it("does not fit a detached terminal", () => {
    const fit = vi.fn();

    expect(fitTerminalToContainer(container(800, 600, false), terminal(0, 0), fit)).toBe(false);
    expect(fit).not.toHaveBeenCalled();
  });

  it("keeps a terminal at the bottom across a fit", () => {
    const fit = vi.fn();
    const instance = terminal(12, 12);

    expect(fitTerminalToContainer(container(800, 600), instance, fit)).toBe(true);
    expect(fit).toHaveBeenCalledOnce();
    expect(instance.scrollToBottom).toHaveBeenCalledOnce();
  });

  it("preserves intentional scrollback across a fit", () => {
    const fit = vi.fn();
    const instance = terminal(8, 12);

    expect(fitTerminalToContainer(container(800, 600), instance, fit)).toBe(true);
    expect(fit).toHaveBeenCalledOnce();
    expect(instance.scrollToBottom).not.toHaveBeenCalled();
  });
});
