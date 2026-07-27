export function projectInitials(name: string): string {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "•"
  );
}
