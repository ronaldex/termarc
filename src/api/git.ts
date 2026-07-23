import { invoke } from "@tauri-apps/api/core";

import type { DiffStatus } from "../utils/gitDiff";

export type GitDiff = {
  directory: string;
  repository?: string;
  diff: string;
  error?: string;
};

export type GitFileSummary = {
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
};

export type GitDiffSummaryResult = {
  directory: string;
  repository?: string;
  files: GitFileSummary[];
  error?: string;
};

export function getProjectGitDiff(directory: string): Promise<GitDiff> {
  return invoke<GitDiff>("get_git_diff_directory", { directory });
}

export function getProjectGitDiffSummary(directory: string): Promise<GitDiffSummaryResult> {
  return invoke<GitDiffSummaryResult>("get_git_diff_summary", { directory });
}
