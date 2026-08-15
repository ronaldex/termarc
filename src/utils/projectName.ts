const FALLBACK_PROJECT_NAME = "New project";

/**
 * Derives a project name from the last segment of a directory path.
 * Falls back to a generic name when the path has no usable segment.
 */
export function projectNameFromDirectory(directory: string): string {
  const segment = directory
    .replace(/[/\\]+$/, "")
    .split(/[/\\]/)
    .filter(Boolean)
    .pop()
    ?.trim();
  return segment || FALLBACK_PROJECT_NAME;
}
