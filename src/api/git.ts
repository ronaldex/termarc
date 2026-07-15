import { invoke } from "@tauri-apps/api/core";

export type GitDiff = {
  directory: string;
  repository?: string;
  diff: string;
  error?: string;
};

export function getProjectGitDiff(directory: string): Promise<GitDiff> {
  return invoke<GitDiff>("get_git_diff_directory", { directory });
}
