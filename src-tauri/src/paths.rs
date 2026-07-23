use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalPath {
    path: String,
    kind: &'static str,
}

pub(crate) fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        home_directory().unwrap_or_else(|| PathBuf::from(path))
    } else if let Some(rest) = path.strip_prefix("~/") {
        home_directory()
            .map(|home| home.join(rest))
            .unwrap_or_else(|| PathBuf::from(path))
    } else {
        PathBuf::from(path)
    }
}

#[tauri::command]
pub(crate) fn resolve_terminal_path(cwd: String, path: String) -> Option<TerminalPath> {
    let path = strip_location_suffix(&path);
    let expanded = expand_user_path(path);
    let resolved = if expanded.is_absolute() {
        expanded
    } else {
        expand_user_path(&cwd).join(expanded)
    };
    let canonical = resolved.canonicalize().ok()?;
    let kind = if canonical.is_dir() {
        "directory"
    } else if canonical.is_file() {
        "file"
    } else {
        return None;
    };

    Some(TerminalPath {
        path: canonical.to_string_lossy().into_owned(),
        kind,
    })
}

fn strip_location_suffix(path: &str) -> &str {
    let mut end = path.len();
    for _ in 0..2 {
        let candidate = &path[..end];
        let Some((prefix, suffix)) = candidate.rsplit_once(':') else {
            break;
        };
        if suffix.is_empty() || !suffix.bytes().all(|byte| byte.is_ascii_digit()) {
            break;
        }
        end = prefix.len();
    }
    &path[..end]
}

pub(crate) fn projects_path() -> PathBuf {
    home_directory()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("termdeck")
        .join("projects.json")
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
