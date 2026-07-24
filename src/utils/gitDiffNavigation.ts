export type GitDiffNavigationAction =
  { type: "focus"; key: string } | { type: "toggle"; key: string } | { type: "enter"; key: string };

export function gitDiffNavigationAction(
  key: string,
  fileKeys: readonly string[],
  activeKey: string | undefined,
  expandedKeys: ReadonlySet<string>,
): GitDiffNavigationAction | undefined {
  if (!fileKeys.length) return;

  const foundIndex = fileKeys.indexOf(activeKey ?? "");
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (foundIndex < 0) {
      const boundary = key === "ArrowDown" ? fileKeys[0] : fileKeys.at(-1);
      return boundary ? { type: "focus", key: boundary } : undefined;
    }
    const offset = key === "ArrowDown" ? 1 : -1;
    return {
      type: "focus",
      key: fileKeys[(foundIndex + offset + fileKeys.length) % fileKeys.length]!,
    };
  }

  const currentKey = fileKeys[foundIndex < 0 ? 0 : foundIndex];
  if (!currentKey) return;
  if (key === "Enter") return { type: "toggle", key: currentKey };
  if (key === "ArrowLeft" && expandedKeys.has(currentKey)) {
    return { type: "toggle", key: currentKey };
  }
  if (key === "ArrowRight") {
    return expandedKeys.has(currentKey)
      ? { type: "enter", key: currentKey }
      : { type: "toggle", key: currentKey };
  }
}
