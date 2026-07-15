use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::paths::projects_path;

static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectConfig {
    id: String,
    name: String,
    directory: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    commands: Option<Vec<ProjectCommand>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectCommand {
    id: String,
    name: String,
    command: String,
    mode: ProjectCommandMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    directory: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ProjectCommandMode {
    SingleShot,
    Persistent,
}

#[tauri::command]
pub(crate) fn load_projects() -> Result<Vec<ProjectConfig>, String> {
    let path = projects_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))
}

#[tauri::command]
pub(crate) fn save_projects(projects: Vec<ProjectConfig>) -> Result<(), String> {
    let path = projects_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("project path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;

    let contents = serde_json::to_vec_pretty(&projects)
        .map_err(|error| format!("could not serialize projects: {error}"))?;
    atomic_write(&path, &contents)
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = temporary_path(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| {
                format!(
                    "could not create temporary project file {}: {error}",
                    temp_path.display()
                )
            })?;
        file.write_all(contents).map_err(|error| {
            format!(
                "could not write temporary project file {}: {error}",
                temp_path.display()
            )
        })?;
        file.sync_all().map_err(|error| {
            format!(
                "could not sync temporary project file {}: {error}",
                temp_path.display()
            )
        })?;
        drop(file);
        fs::rename(&temp_path, path).map_err(|error| {
            format!(
                "could not replace {} with {}: {error}",
                path.display(),
                temp_path.display()
            )
        })
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn temporary_path(path: &Path) -> PathBuf {
    let id = NEXT_TEMP_FILE_ID.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("projects.json");
    path.with_file_name(format!(".{file_name}.{}.{id}.tmp", std::process::id()))
}
