import { nextTick, ref, watch } from "vue";
import { gitDiffNavigationAction } from "../utils/gitDiffNavigation";

export function useGitDiffKeyboardNavigation(options: {
  fileKeys: () => readonly string[];
  expandedKeys: () => ReadonlySet<string>;
  fontSize: () => number;
  toggleFile: (key: string) => void;
}) {
  const rootElement = ref<HTMLElement>();
  const diffContentElement = ref<HTMLElement>();
  const activeFileKey = ref<string>();
  const focusedDiffKey = ref<string>();
  const fileButtons = new Map<string, HTMLButtonElement>();
  const fileDiffs = new Map<string, HTMLElement>();

  function setFileButton(element: Element | null, key: string): void {
    if (element instanceof HTMLButtonElement) fileButtons.set(key, element);
    else fileButtons.delete(key);
  }

  function setFileDiff(element: Element | null, key: string): void {
    if (element instanceof HTMLElement) fileDiffs.set(key, element);
    else fileDiffs.delete(key);
  }

  function focusFile(key: string): void {
    activeFileKey.value = key;
    void nextTick(() => {
      const button = fileButtons.get(key);
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest" });
    });
  }

  function focusActiveFile(): void {
    const keys = options.fileKeys();
    const key = keys.includes(activeFileKey.value ?? "") ? activeFileKey.value : keys[0];
    if (key) focusFile(key);
    else rootElement.value?.focus({ preventScroll: true });
  }

  function focusFileDiff(key: string): void {
    activeFileKey.value = key;
    void nextTick(() => fileDiffs.get(key)?.focus({ preventScroll: true }));
  }

  function scrollFileDiff(event: KeyboardEvent, diff: HTMLElement): boolean {
    const viewport = diffContentElement.value;
    if (!viewport) return false;

    const lineStep = Math.max(32, options.fontSize() * 2);
    if (event.key === "ArrowUp") viewport.scrollBy({ top: -lineStep });
    else if (event.key === "ArrowDown") viewport.scrollBy({ top: lineStep });
    else if (event.key === "PageUp") viewport.scrollBy({ top: -viewport.clientHeight * 0.85 });
    else if (event.key === "PageDown") viewport.scrollBy({ top: viewport.clientHeight * 0.85 });
    else if (event.key === "Home") {
      const section = diff.closest<HTMLElement>(".file-change");
      if (section) viewport.scrollTo({ top: section.offsetTop });
    } else if (event.key === "End") {
      const section = diff.closest<HTMLElement>(".file-change");
      if (section) {
        viewport.scrollTo({
          top: section.offsetTop + section.offsetHeight - viewport.clientHeight,
        });
      }
    } else {
      return false;
    }
    return true;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

    const target = event.target instanceof Element ? event.target : undefined;
    const focusedDiff = target?.closest<HTMLElement>(".file-diff");
    if (focusedDiff) {
      if (event.key === "ArrowLeft" && activeFileKey.value) {
        event.preventDefault();
        event.stopPropagation();
        focusFile(activeFileKey.value);
      } else if (scrollFileDiff(event, focusedDiff)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    const action = gitDiffNavigationAction(
      event.key,
      options.fileKeys(),
      activeFileKey.value,
      options.expandedKeys(),
    );
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (action.type === "focus") focusFile(action.key);
    else if (action.type === "enter") focusFileDiff(action.key);
    else options.toggleFile(action.key);
  }

  watch(
    options.fileKeys,
    (keys) => {
      if (!keys.includes(activeFileKey.value ?? "")) activeFileKey.value = keys[0];
      if (keys[0] && document.activeElement === rootElement.value) focusFile(activeFileKey.value!);
    },
    { immediate: true },
  );

  return {
    rootElement,
    diffContentElement,
    activeFileKey,
    focusedDiffKey,
    setFileButton,
    setFileDiff,
    focusActiveFile,
    handleKeydown,
  };
}
