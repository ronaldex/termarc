export type DiffData = {
  key: string;
  oldFile: { fileName: string };
  newFile: { fileName: string };
  hunks: string[];
};

export function splitGitDiff(diff: string): DiffData[] {
  return diff
    .split(/(?=^diff --git )/m)
    .filter(Boolean)
    .map((hunk, index) => {
      const header = hunk.match(/^diff --git a\/(.+) b\/(.+)$/m);
      const oldFile = hunk.match(/^--- (?:a\/)?(.+)$/m)?.[1] ?? header?.[1] ?? "Deleted file";
      const newFile = hunk.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1] ?? header?.[2] ?? "New file";

      return {
        key: `${oldFile}-${newFile}-${index}`,
        oldFile: { fileName: oldFile === "/dev/null" ? newFile : oldFile },
        newFile: { fileName: newFile === "/dev/null" ? oldFile : newFile },
        hunks: [hunk],
      };
    });
}
