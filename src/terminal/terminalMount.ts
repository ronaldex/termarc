export type TerminalMount = {
  root: HTMLDivElement;
  target?: HTMLDivElement;
};

export function createTerminalMount(documentRoot: Document = document): TerminalMount {
  const root = documentRoot.createElement("div");
  root.className = "terminal-runtime-root";
  return { root };
}

/** Move a stable xterm root. A stale target unmount cannot remove a newer mount. */
export function mountTerminalRoot(mount: TerminalMount, target: HTMLDivElement | null): boolean {
  if (target) {
    mount.target = target;
    if (mount.root.parentElement !== target) target.append(mount.root);
    return true;
  }
  return false;
}

export function unmountTerminalRoot(mount: TerminalMount, target: HTMLDivElement): boolean {
  if (mount.target !== target) return false;
  mount.target = undefined;
  mount.root.remove();
  return true;
}

/**
 * A stable Vue function-ref owner. It remembers the target represented by its
 * own lifecycle, so a delayed null callback cannot unmount a replacement.
 */
export function createTerminalMountRef(
  mount: TerminalMount,
  onTarget?: (target: HTMLDivElement | undefined) => void,
): (element: Element | null) => void {
  let target: HTMLDivElement | undefined;
  return (element) => {
    if (element) {
      target = element as HTMLDivElement;
      mountTerminalRoot(mount, target);
      onTarget?.(target);
      return;
    }
    if (!target) return;
    const unmounted = unmountTerminalRoot(mount, target);
    target = undefined;
    if (unmounted) onTarget?.(undefined);
  };
}
