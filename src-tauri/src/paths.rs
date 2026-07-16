use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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

#[tauri::command]
pub(crate) fn open_terminal_path(path: String) -> Result<(), String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve path: {error}"))?;

    let mut command = platform_open_command(&canonical)?;
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open path: {error}"))
}

#[cfg(target_os = "macos")]
fn platform_open_command(path: &Path) -> Result<Command, String> {
    let mut command = Command::new("open");
    if path.is_file() {
        command.args(["-a", "VSCodium"]);
    }
    command.arg(path);
    Ok(command)
}

#[cfg(target_os = "windows")]
fn platform_open_command(path: &Path) -> Result<Command, String> {
    let mut command = if path.is_dir() {
        Command::new("explorer")
    } else {
        Command::new("codium")
    };
    command.arg(path);
    Ok(command)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn platform_open_command(path: &Path) -> Result<Command, String> {
    let mut command = if path.is_dir() {
        Command::new("xdg-open")
    } else {
        Command::new("codium")
    };
    command.arg(path);
    Ok(command)
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
