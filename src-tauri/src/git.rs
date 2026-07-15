use serde::Serialize;
use std::{path::Path, process::Command};

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

#[tauri::command]
pub(crate) fn get_git_diff_directory(directory: String) -> Result<GitDiff, String> {
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

fn git_output(directory: &Path, args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(args)
        .output()
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
