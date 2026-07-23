import { describe, expect, it } from "vitest";
import { splitGitDiff, summarizeGitDiff } from "./gitDiff";

describe("splitGitDiff", () => {
  it("splits multiple files and preserves hunks", () => {
    const diff = [
      "diff --git a/one.txt b/one.txt\n--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n-old\n+new\n",
      "diff --git a/two.txt b/two.txt\n--- a/two.txt\n+++ b/two.txt\n@@ -0,0 +1 @@\n+two\n",
    ].join("");

    const files = splitGitDiff(diff);

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.newFile.fileName)).toEqual(["one.txt", "two.txt"]);
    expect(files[0]).toMatchObject({
      path: "one.txt",
      status: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(files[0]!.hunks[0]).toContain("+new");
  });

  it("uses the surviving name for created and deleted files", () => {
    const created = splitGitDiff(
      "diff --git a/new.txt b/new.txt\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n",
    )[0];
    const deleted = splitGitDiff(
      "diff --git a/old.txt b/old.txt\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n",
    )[0];

    expect(created).toMatchObject({ path: "new.txt", status: "added", additions: 1, deletions: 0 });
    expect(deleted).toMatchObject({
      path: "old.txt",
      status: "deleted",
      additions: 0,
      deletions: 1,
    });
    expect(created!.oldFile.fileName).toBe("new.txt");
    expect(deleted!.newFile.fileName).toBe("old.txt");
  });

  it("identifies renamed files", () => {
    const renamed = splitGitDiff(
      "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n",
    )[0];

    expect(renamed).toMatchObject({ path: "new.txt", status: "renamed" });
  });

  it("returns no files for an empty diff", () => {
    expect(splitGitDiff("")).toEqual([]);
  });

  it("summarizes file and line changes", () => {
    const files = splitGitDiff(
      [
        "diff --git a/one.txt b/one.txt\n--- a/one.txt\n+++ b/one.txt\n@@ -1 +1,2 @@\n-old\n+new\n+line\n",
        "diff --git a/two.txt b/two.txt\n--- /dev/null\n+++ b/two.txt\n@@ -0,0 +1 @@\n+two\n",
      ].join(""),
    );

    expect(summarizeGitDiff(files)).toEqual({
      files: 2,
      additions: 3,
      deletions: 1,
      statuses: { added: 1, deleted: 0, modified: 1, renamed: 0 },
    });
  });
});
