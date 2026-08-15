/** Expands a leading `~` to the given home directory. Other paths pass through unchanged. */
export function expandHomePath(path: string, home: string): string {
  if (path !== "~" && !path.startsWith("~/")) return path;
  const trimmedHome = home.replace(/\/+$/, "");
  const relative = path === "~" ? "" : path.slice(2);
  return relative ? `${trimmedHome}/${relative}` : trimmedHome;
}
