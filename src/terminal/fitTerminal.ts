type MeasurableTerminalContainer = Pick<HTMLElement, "getBoundingClientRect" | "isConnected">;

type ScrollableTerminal = {
  readonly buffer: {
    readonly active: {
      readonly baseY: number;
      readonly viewportY: number;
    };
  };
  scrollToBottom: () => void;
};

export function fitTerminalToContainer(
  container: MeasurableTerminalContainer | undefined,
  terminal: ScrollableTerminal,
  fit: () => void,
): boolean {
  if (!container?.isConnected) return false;

  const { width, height } = container.getBoundingClientRect();
  if (width <= 0 || height <= 0) return false;

  const buffer = terminal.buffer.active;
  const wasAtBottom = buffer.viewportY === buffer.baseY;
  fit();
  if (wasAtBottom) terminal.scrollToBottom();
  return true;
}
