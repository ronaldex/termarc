export type DiffStatus = "added" | "deleted" | "modified" | "renamed";

export type DiffData = {
  key: string;
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  oldFile: { fileName: string };
  newFile: { fileName: string };
  hunks: string[];
};

export type GitDiffSummary = {
  files: number;
  additions: number;
  deletions: number;
  statuses: Record<DiffStatus, number>;
};

export function summarizeGitDiff(files: readonly DiffData[]): GitDiffSummary {
  return files.reduce<GitDiffSummary>(
    (summary, file) => {
      summary.files += 1;
      summary.additions += file.additions;
      summary.deletions += file.deletions;
      summary.statuses[file.status] += 1;
      return summary;
    },
    {
      files: 0,
      additions: 0,
      deletions: 0,
      statuses: { added: 0, deleted: 0, modified: 0, renamed: 0 },
    },
  );
}

function getFileStatus(hunk: string, oldFile: string, newFile: string): DiffData["status"] {
  if (oldFile === "/dev/null" || /^new file mode /m.test(hunk)) return "added";
  if (newFile === "/dev/null" || /^deleted file mode /m.test(hunk)) return "deleted";
  if (oldFile !== newFile) return "renamed";
  return "modified";
}

export function splitGitDiff(diff: string): DiffData[] {
  return diff
    .split(/(?=^diff --git )/m)
    .filter(Boolean)
    .map((hunk) => {
      const header = hunk.match(/^diff --git a\/(.+) b\/(.+)$/m);
      const oldFile = hunk.match(/^--- (?:a\/)?(.+)$/m)?.[1] ?? header?.[1] ?? "Deleted file";
      const newFile = hunk.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1] ?? header?.[2] ?? "New file";

      const path = newFile === "/dev/null" ? oldFile : newFile;
      const status = getFileStatus(hunk, oldFile, newFile);
      const lines = hunk.split("\n");

      return {
        key: `${oldFile}→${newFile}`,
        path,
        status,
        additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
        deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
        oldFile: { fileName: oldFile === "/dev/null" ? newFile : oldFile },
        newFile: { fileName: newFile === "/dev/null" ? oldFile : newFile },
        hunks: [hunk],
      };
    });
}
