use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::paths::{project_tree_state_path, projects_path};

static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectConfig {
    id: String,
    name: String,
    directory: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    external_editor: Option<crate::external_editor::ExternalEditor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    commands: Option<Vec<ProjectCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    terminals: Option<Vec<ProjectTerminal>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTerminal {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    custom_title: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectCommand {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) command: String,
    pub(crate) mode: ProjectCommandMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) storage: Option<CommandStorage>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ProjectCommandMode {
    SingleShot,
    Persistent,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CommandStorage {
    Global,
    Project,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectTreeStateConfig {
    project_open: bool,
    terminal_open: bool,
    commands_open: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadedProjectConfig {
    id: String,
    name: String,
    directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_editor: Option<crate::external_editor::ExternalEditor>,
    commands: Vec<ProjectCommand>,
    global_commands: Vec<ProjectCommand>,
    local_commands: Vec<ProjectCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    local_config_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminals: Option<Vec<ProjectTerminal>>,
}

#[tauri::command]
pub(crate) fn load_projects() -> Result<Vec<LoadedProjectConfig>, String> {
    let path = projects_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let projects: Vec<ProjectConfig> = serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))?;

    Ok(projects.into_iter().map(load_project).collect())
}

fn load_project(project: ProjectConfig) -> LoadedProjectConfig {
    let mut global_commands = project.commands.unwrap_or_default();
    for command in &mut global_commands {
        command.storage = Some(CommandStorage::Global);
    }
    let (mut local_commands, local_config_error) =
        match crate::project_local_config::load(&project.directory) {
            Ok(Some(commands)) => (commands, None),
            Ok(None) => (Vec::new(), None),
            Err(error) => (Vec::new(), Some(error)),
        };
    for command in &mut local_commands {
        command.storage = Some(CommandStorage::Project);
    }
    let mut commands = global_commands.clone();
    for local in &local_commands {
        if let Some(index) = commands.iter().position(|global| global.id == local.id) {
            commands[index] = local.clone();
        } else {
            commands.push(local.clone());
        }
    }
    LoadedProjectConfig {
        id: project.id,
        name: project.name,
        directory: project.directory,
        external_editor: project.external_editor,
        commands,
        global_commands,
        local_commands,
        local_config_error,
        terminals: project.terminals,
    }
}

#[tauri::command]
pub(crate) fn load_project_tree_state()
-> Result<std::collections::HashMap<String, ProjectTreeStateConfig>, String> {
    let path = project_tree_state_path();
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))
}

#[tauri::command]
pub(crate) fn save_project_tree_state(
    state: std::collections::HashMap<String, ProjectTreeStateConfig>,
) -> Result<(), String> {
    let path = project_tree_state_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("state path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    let contents = serde_json::to_vec_pretty(&state)
        .map_err(|error| format!("could not serialize project tree state: {error}"))?;
    atomic_write(&path, &contents)
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

#[tauri::command]
pub(crate) fn save_local_project_commands(
    directory: String,
    commands: Vec<ProjectCommand>,
) -> Result<(), String> {
    crate::project_local_config::save(&directory, commands)
}

pub(crate) fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::ProjectConfig;

    #[test]
    fn loads_legacy_projects_without_an_editor_override() {
        let project: ProjectConfig =
            serde_json::from_str(r#"{"id":"project-1","name":"Project","directory":"."}"#)
                .expect("legacy project should load");

        assert!(project.external_editor.is_none());
    }

    #[test]
    fn round_trips_project_editor_overrides() {
        let project: ProjectConfig = serde_json::from_str(
            r#"{"id":"project-1","name":"Project","directory":".","externalEditor":"phpstorm"}"#,
        )
        .expect("project editor should load");
        let serialized = serde_json::to_value(project).expect("project should serialize");

        assert_eq!(serialized["externalEditor"], "phpstorm");
    }

    #[test]
    fn omits_missing_project_editor_overrides() {
        let project: ProjectConfig =
            serde_json::from_str(r#"{"id":"project-1","name":"Project","directory":"."}"#)
                .expect("project should load");
        let serialized = serde_json::to_value(project).expect("project should serialize");

        assert!(serialized.get("externalEditor").is_none());
    }
}
