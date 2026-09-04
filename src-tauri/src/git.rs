use serde::Serialize;
use std::{collections::HashMap, path::Path, process::Command};

use crate::paths::expand_user_path;

const MAX_DIFF_BYTES: usize = 1_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitDiff {
    directory: String,
    repository: Option<String>,
    diff: String,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitDiffSummary {
    directory: String,
    repository: Option<String>,
    files: Vec<GitFileSummary>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitFileSummary {
    path: String,
    status: String,
    additions: usize,
    deletions: usize,
}

#[tauri::command]
pub(crate) async fn get_git_diff_directory(directory: String) -> Result<GitDiff, String> {
    run_blocking_git("git diff", move || {
        get_git_diff_directory_blocking(directory)
    })
    .await
}

fn get_git_diff_directory_blocking(directory: String) -> Result<GitDiff, String> {
    let directory = expand_user_path(&directory);
    let directory_text = directory.display().to_string();
    let repository = git_output(&directory, &["rev-parse", "--show-toplevel"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());

    let Some(repository) = repository else {
        return Ok(empty_diff(directory_text));
    };

    let has_head = git_output(&directory, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    if !has_head {
        return Ok(empty_diff(directory_text));
    }

    let output = git_output(
        &directory,
        &["diff", "--no-ext-diff", "--no-color", "HEAD", "--"],
    )
    .map_err(|error| format!("could not run git diff: {error}"))?;
    let mut diff = String::from_utf8_lossy(&output.stdout).into_owned();
    truncate_diff(&mut diff);

    Ok(GitDiff {
        directory: directory_text,
        repository: Some(repository),
        diff,
        error: (!output.status.success())
            .then(|| String::from_utf8_lossy(&output.stderr).trim().to_string()),
    })
}

#[tauri::command]
pub(crate) async fn get_git_diff_summary(directory: String) -> Result<GitDiffSummary, String> {
    run_blocking_git("git diff summary", move || {
        get_git_diff_summary_blocking(directory)
    })
    .await
}

fn get_git_diff_summary_blocking(directory: String) -> Result<GitDiffSummary, String> {
    let directory = expand_user_path(&directory);
    let directory_text = directory.display().to_string();
    let repository = git_output(&directory, &["rev-parse", "--show-toplevel"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());

    let Some(repository) = repository else {
        return Ok(empty_summary(directory_text));
    };

    let has_head = git_output(&directory, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    if !has_head {
        return Ok(empty_summary(directory_text));
    }

    let output = git_output(&directory, &["diff", "--numstat", "-z", "HEAD", "--"])
        .map_err(|error| format!("could not read git diff summary: {error}"))?;
    let status_output = git_output(&directory, &["diff", "--name-status", "-z", "HEAD", "--"])
        .map_err(|error| format!("could not read git file statuses: {error}"))?;
    let statuses = parse_name_status(&status_output.stdout);
    let files = parse_numstat(&output.stdout, &statuses);

    Ok(GitDiffSummary {
        directory: directory_text,
        repository: Some(repository),
        files,
        error: (!output.status.success() || !status_output.status.success()).then(|| {
            let stderr = if output.status.success() {
                &status_output.stderr
            } else {
                &output.stderr
            };
            String::from_utf8_lossy(stderr).trim().to_string()
        }),
    })
}

async fn run_blocking_git<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{operation} task failed: {error}"))?
}

fn parse_name_status(output: &[u8]) -> HashMap<String, String> {
    let mut fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut statuses = HashMap::new();

    while let Some(status_field) = fields.next() {
        let status_code = status_field.first().copied().unwrap_or(b'M');
        let Some(first_path) = fields.next() else {
            break;
        };
        let path = if matches!(status_code, b'R' | b'C') {
            fields.next().unwrap_or(first_path)
        } else {
            first_path
        };
        let status = match status_code {
            b'A' => "added",
            b'D' => "deleted",
            b'R' | b'C' => "renamed",
            _ => "modified",
        };
        statuses.insert(
            String::from_utf8_lossy(path).into_owned(),
            status.to_string(),
        );
    }

    statuses
}

fn parse_numstat(output: &[u8], statuses: &HashMap<String, String>) -> Vec<GitFileSummary> {
    let mut records = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut files = Vec::new();

    while let Some(record) = records.next() {
        let mut fields = record.splitn(3, |byte| *byte == b'\t');
        let additions = parse_count(fields.next().unwrap_or_default());
        let deletions = parse_count(fields.next().unwrap_or_default());
        let inline_path = fields.next().unwrap_or_default();
        let path = if inline_path.is_empty() {
            let old_path = records.next().unwrap_or_default();
            records.next().unwrap_or(old_path)
        } else {
            inline_path
        };
        let path = String::from_utf8_lossy(path).into_owned();
        files.push(GitFileSummary {
            status: statuses
                .get(&path)
                .cloned()
                .unwrap_or_else(|| "modified".to_string()),
            path,
            additions,
            deletions,
        });
    }

    files
}

fn parse_count(value: &[u8]) -> usize {
    std::str::from_utf8(value)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn git_output(directory: &Path, args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(args)
        .output()
}

fn empty_summary(directory: String) -> GitDiffSummary {
    GitDiffSummary {
        directory,
        repository: None,
        files: Vec::new(),
        error: None,
    }
}

fn empty_diff(directory: String) -> GitDiff {
    GitDiff {
        directory,
        repository: None,
        diff: String::new(),
        error: None,
    }
}

fn truncate_diff(diff: &mut String) {
    if diff.len() <= MAX_DIFF_BYTES {
        return;
    }

    let mut boundary = MAX_DIFF_BYTES;
    while !diff.is_char_boundary(boundary) {
        boundary -= 1;
    }
    diff.truncate(boundary);
    diff.push_str("\n\n[Diff truncated at 1 MB]\n");
}

#[cfg(test)]
mod tests {
    use super::{parse_name_status, parse_numstat};

    #[test]
    fn parses_compact_diff_summary() {
        let statuses = parse_name_status(
            b"M\0src/main.rs\0A\0src/new.rs\0D\0src/old.rs\0R100\0src/before.rs\0src/after.rs\0",
        );
        let files = parse_numstat(
            b"2\t1\tsrc/main.rs\04\t0\tsrc/new.rs\00\t3\tsrc/old.rs\00\t0\t\0src/before.rs\0src/after.rs\0",
            &statuses,
        );

        assert_eq!(files.len(), 4);
        assert_eq!(files[0].status, "modified");
        assert_eq!(files[0].additions, 2);
        assert_eq!(files[1].status, "added");
        assert_eq!(files[2].status, "deleted");
        assert_eq!(files[3].status, "renamed");
        assert_eq!(files[3].path, "src/after.rs");
    }
}
