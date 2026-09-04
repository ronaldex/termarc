const PREFIX = "termarc:startup:";

function supportsPerformanceMarks(): boolean {
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

/** Records lightweight startup milestones for WebView performance traces. */
export function markStartup(name: string): void {
  if (supportsPerformanceMarks()) performance.mark(`${PREFIX}${name}`);
}

/** Measures between startup milestones when both marks are available. */
export function measureStartup(name: string, start: string, end: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(`${PREFIX}${name}`, `${PREFIX}${start}`, `${PREFIX}${end}`);
  } catch {
    // A startup branch may intentionally omit a mark. Measurements are diagnostic only.
  }
}
